import { AIService } from '@src/features/ai/services/ai.service';

export interface Document {
  id: string;
  content: string;
  metadata?: any;
}

export async function mockSearch(query: string): Promise<Document[]> {
  // Mock search implementation
  return [
    { id: '1', content: `Mock document 1 related to: ${query}` },
    { id: '2', content: `Mock document 2 related to: ${query}` }
  ];
}

/**
 * Grades the relevance of the retrieved document to the query.
 * Returns true if relevant, false otherwise.
 */
export async function gradeRetrieval(query: string, documentContent: string): Promise<boolean> {
  const prompt = `You are a strict relevance grader. 
Does the following document contain information relevant to answering the user's query?
Answer only 'yes' or 'no'.

Query: ${query}

Document:
${documentContent}
`;

  try {
    const response = await AIService.execute(
      'qwen2.5-coder-3b-native', // Local model
      'nyx-native', // Provider
      prompt,
      undefined, // API Key (not needed for local)
      'You are a strict grading assistant. Respond with either "yes" or "no".',
      { temperature: 0 } // Settings
    );
    
    const text = response.text?.trim().toLowerCase() || '';
    return text.includes('yes');
  } catch (error) {
    console.error('Error grading retrieval:', error);
    // On failure, conservatively assume relevant so we don't discard valid context
    return true; 
  }
}

/**
 * Rewrites the user query to improve retrieval if initial retrieval was poor.
 */
export async function rewriteQuery(query: string): Promise<string> {
  const prompt = `Rewrite the following user query to be more effective for vector search retrieval. 
Only output the new query, nothing else.

Original Query: ${query}
`;

  try {
    const response = await AIService.execute(
      'qwen2.5-coder-3b-native',
      'nyx-native',
      prompt,
      undefined,
      'You are a helpful assistant that optimizes search queries.',
      { temperature: 0.2 }
    );
    
    return response.text?.trim() || query;
  } catch (error) {
    console.error('Error rewriting query:', error);
    return query;
  }
}

/**
 * Orchestrates the CRAG (Corrective RAG) loop.
 */
export async function runAgenticRAG(initialQuery: string, maxRetries = 2): Promise<{
  finalQuery: string;
  documents: Document[];
  answer: string;
}> {
  let currentQuery = initialQuery;
  let relevantDocs: Document[] = [];
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 1. Retrieve
    const retrievedDocs = await mockSearch(currentQuery);
    
    // 2. Grade
    relevantDocs = [];
    for (const doc of retrievedDocs) {
      const isRelevant = await gradeRetrieval(currentQuery, doc.content);
      if (isRelevant) {
        relevantDocs.push(doc);
      }
    }
    
    // 3. Check if we have enough context
    if (relevantDocs.length > 0) {
      break; // Success! We have relevant context
    }
    
    // 4. Corrective RAG: Rewrite Query if we haven't exhausted retries
    if (attempt < maxRetries) {
      currentQuery = await rewriteQuery(currentQuery);
    }
  }
  
  // 5. Generate final answer using context
  const contextText = relevantDocs.map(d => d.content).join('\n\n');
  const finalPrompt = `Answer the user's query based ONLY on the provided context. If the context does not contain the answer, say "I don't know based on the provided context."

Query: ${initialQuery}

Context:
${contextText}
`;

  let finalAnswer = "I don't know based on the provided context.";
  try {
    const response = await AIService.execute(
      'qwen2.5-coder-3b-native',
      'nyx-native',
      finalPrompt,
      undefined,
      'You are a helpful and concise assistant.',
      { temperature: 0.3 }
    );
    finalAnswer = response.text || finalAnswer;
  } catch (error) {
    console.error('Error generating final answer:', error);
  }

  return {
    finalQuery: currentQuery,
    documents: relevantDocs,
    answer: finalAnswer,
  };
}

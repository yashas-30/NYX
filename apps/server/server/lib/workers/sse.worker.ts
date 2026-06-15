import { parentPort } from 'worker_threads';

if (!parentPort) {
  throw new Error('This file must run as a worker thread');
}

const decoder = new TextDecoder();
let buffer = '';
let eventData: string[] = [];

parentPort.on('message', (message) => {
  if (message.type === 'chunk') {
    try {
      buffer += decoder.decode(message.value, { stream: true });
      
      let start = 0;

      while (start < buffer.length) {
        const end = buffer.indexOf('\n', start);
        if (end === -1) break;

        const line = buffer.substring(start, end).replace(/\r$/, '');
        start = end + 1;

        if (line === '') {
          if (eventData.length > 0) {
            const fullData = eventData.join('\n');
            eventData = [];
            
            if (fullData === '[DONE]' || fullData === '[done]') {
              parentPort!.postMessage({ type: 'done' });
              return;
            }

            try {
              const data = JSON.parse(fullData);

              if (data.error) {
                const msg = typeof data.error === 'object' ? data.error.message || JSON.stringify(data.error) : data.error;
                parentPort!.postMessage({ type: 'error', message: msg });
                return;
              }

              let chunk = data.choices?.[0]?.delta?.content;
              if (!chunk) chunk = data.choices?.[0]?.delta?.message?.content;
              if (!chunk) chunk = data.choices?.[0]?.message?.content;
              if (!chunk && typeof data.chunk === 'string') chunk = data.chunk;

              if (chunk) {
                parentPort!.postMessage({ type: 'chunk', data: chunk });
              }

              const parts = data.candidates?.[0]?.content?.parts;
              if (Array.isArray(parts)) {
                for (const part of parts) {
                  if (part.thought === true || part.thought === 'true') {
                    if (part.text) parentPort!.postMessage({ type: 'chunk', data: { thinking: part.text } });
                  } else if (part.functionCall) {
                    parentPort!.postMessage({ type: 'chunk', data: { functionCall: part.functionCall } });
                  } else if (part.text) {
                    parentPort!.postMessage({ type: 'chunk', data: part.text });
                  }
                }
              }

              if (data.usageMetadata || data.usage) {
                parentPort!.postMessage({ type: 'chunk', data: { type: 'metrics', metadata: data.usageMetadata || data.usage } });
              }

              const finishReason = data.choices?.[0]?.finish_reason || data.candidates?.[0]?.finishReason;
              if (finishReason === 'stop' || finishReason === 'length' || finishReason === 'STOP') {
                parentPort!.postMessage({ type: 'done' });
                return;
              }
            } catch {
              // Ignore parsing errors for partial/malformed chunks
            }
          }
        } else if (line.startsWith('data:')) {
          const dataStr = line.substring(5).replace(/^ /, '');
          eventData.push(dataStr);
        } else if (line.startsWith('error:')) {
           parentPort!.postMessage({ type: 'error', message: line.substring(6).trimStart() });
           return;
        }
      }
      
      buffer = buffer.substring(start);
    } catch (err: any) {
      parentPort!.postMessage({ type: 'error', message: err.message || 'Worker processing error' });
    }
  } else if (message.type === 'end') {
    parentPort!.postMessage({ type: 'done' });
  }
});

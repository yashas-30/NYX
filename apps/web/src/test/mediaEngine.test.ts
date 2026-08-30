import { vi, describe, it, expect } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(''),
  convertFileSrc: vi.fn((src) => src),
}));

import {
  isYouTubeUrl,
  extractYouTubeVideoId,
  isNonEnglishText,
  parseDurationToSeconds,
  isYouTubeShortsVideo,
  calculateVideoExplanationScore,
} from '../core/services/mediaEngine';
import { distributeMediaIntoMarkdown } from '../features/chat/components/ChatMessageList';

describe('mediaEngine — YouTube URL parsing', () => {
  it('identifies standard watch URLs', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(isYouTubeUrl(url)).toBe(true);
    expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
  });

  it('identifies youtu.be short URLs', () => {
    const url = 'https://youtu.be/dQw4w9WgXcQ';
    expect(isYouTubeUrl(url)).toBe(true);
    expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
  });

  it('identifies embed and shorts URLs', () => {
    const embedUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
    const shortsUrl = 'https://www.youtube.com/shorts/dQw4w9WgXcQ';
    expect(isYouTubeUrl(embedUrl)).toBe(true);
    expect(extractYouTubeVideoId(embedUrl)).toBe('dQw4w9WgXcQ');
    expect(isYouTubeUrl(shortsUrl)).toBe(true);
    expect(extractYouTubeVideoId(shortsUrl)).toBe('dQw4w9WgXcQ');
  });

  it('rejects non-YouTube URLs', () => {
    expect(isYouTubeUrl('https://example.com/video.mp4')).toBe(false);
    expect(extractYouTubeVideoId('https://example.com/video.mp4')).toBeNull();
  });
});

describe('mediaEngine — English language & Shorts filtering', () => {
  it('identifies non-English foreign scripts', () => {
    expect(isNonEnglishText('Quantum Computing Explained')).toBe(false);
    expect(isNonEnglishText('IBM Technology Channel')).toBe(false);
    expect(isNonEnglishText('क्वांटम कंप्यूटिंग क्या है?')).toBe(true); // Devanagari
    expect(isNonEnglishText('Что такое квантовый компьютер?')).toBe(true); // Cyrillic
    expect(isNonEnglishText('什么是量子计算？')).toBe(true); // Chinese CJK
    expect(isNonEnglishText('ما هو الحوسبة الكمية؟')).toBe(true); // Arabic
  });

  it('parses duration strings into seconds', () => {
    expect(parseDurationToSeconds('12:30')).toBe(750);
    expect(parseDurationToSeconds('0:45')).toBe(45);
    expect(parseDurationToSeconds('1:15:00')).toBe(4500);
    expect(parseDurationToSeconds('')).toBe(0);
  });

  it('identifies and rejects YouTube Shorts', () => {
    expect(isYouTubeShortsVideo('https://www.youtube.com/shorts/abc123xyz89')).toBe(true);
    expect(
      isYouTubeShortsVideo('https://www.youtube.com/watch?v=abc', 'Cool AI trick #shorts', '', 30)
    ).toBe(true);
    expect(
      isYouTubeShortsVideo('https://www.youtube.com/watch?v=abc', 'AI trick #short', '', 50)
    ).toBe(true);
    expect(
      isYouTubeShortsVideo(
        'https://www.youtube.com/watch?v=abc',
        'Quantum Computing Full Course',
        '',
        40
      )
    ).toBe(true); // < 75s rejected
    expect(
      isYouTubeShortsVideo(
        'https://www.youtube.com/watch?v=abc',
        'Quantum Computing Architecture Explained',
        '',
        720
      )
    ).toBe(false); // In-depth video passed
  });

  it('rewards high view count and educational keywords in explanation scoring', () => {
    const highQualityScore = calculateVideoExplanationScore(
      4500000, // 4.5M views
      750, // 12:30 duration
      'Majorana 1 Explained: The Path to a Million Qubits',
      'Microsoft'
    );
    const lowQualityScore = calculateVideoExplanationScore(
      80, // 80 views
      90, // 1:30 duration
      'random vlog episode 1',
      'user123'
    );

    expect(highQualityScore).toBeGreaterThan(lowQualityScore + 40);
  });
});

describe('distributeMediaIntoMarkdown — multimodal placement', () => {
  it('places video and image under matching subheadings without header pollution', () => {
    const text = `# Quantum Computing Architecture\n\nQuantum computing leverages superposition.\n\n## Physical Realization\n\nSuperconducting transmon circuits are used.\n\n## Experimental Demonstrations\n\nLaboratory setups verify entanglement.`;
    const images = [{ url: 'https://example.com/chip.jpg', name: 'Qubit Chip Lattice' }];
    const videos = [
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Superposition in Action' },
    ];

    const distributed = distributeMediaIntoMarkdown(text, images, videos);

    expect(distributed).toContain('![Qubit Chip Lattice](https://example.com/chip.jpg)');
    expect(distributed).toContain(
      '[YouTube Video: Superposition in Action](https://www.youtube.com/watch?v=dQw4w9WgXcQ)'
    );
    // Ensures media is placed below subheadings and not above introductory text
    expect(distributed.indexOf('# Quantum Computing Architecture')).toBeLessThan(
      distributed.indexOf('![Qubit Chip Lattice]')
    );
  });
});

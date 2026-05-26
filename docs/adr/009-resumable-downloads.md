# ADR 009: Resumable GGUF Model Downloads with HTTP Range Requests

## Context and Problem Statement

NYX allows users to download heavy GGUF model files (ranging from 1.5 GB to 40+ GB) directly from HuggingFace or custom URLs onto their local GPUs.
Previously, downloading was handled via a simple HTTP pipeline streaming directly to `.tmp` files. This model suffered from critical drawbacks:
1. **No Resumption Support:** Any network blip, connection timeout, or user pause forced the download to restart from 0% — leading to massive user frustration and wasted bandwidth.
2. **State Corruption:** Interrupted files were often left in a half-written state without clear markers of integrity.

## Decision Drivers

* **Reliability:** Bulletproof model delivery over highly variable network conditions.
* **Bandwidth Preservation:** Eliminate redundant downloads for heavy GGUF files.
* **State Accuracy:** Provide accurate progress metrics to the frontend during pause, play, and resume cycles.

## Decision Outcome

We decided to implement **HTTP Range-resumable downloads** inside `LocalModelManager.ts` under the following rules:

1. **Persistent Incomplete Downloads (`.part`):** Active model downloads write to `[model-filename].part` instead of overwriting a temp path on failure.
2. **HTTP Range Header:** Before establishing the network connection, we check if `[model-filename].part` already exists on disk. If found, we read its size in bytes and request only the remaining bytes via the `Range: bytes=[size]-` header.
3. **Graceful Fallback:** If the remote server responds with `206 Partial Content`, we append directly to the `.part` file. If the server does not support ranges (status `200 OK`), we automatically fall back to downloading from 0% and overwrite the file cleanly.
4. **Atomic Swap:** Upon a fully complete stream, the `.part` extension is atomically renamed to `.gguf` via `fs.renameSync()`, instantly making it visible to the local llama runner.

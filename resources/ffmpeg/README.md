Bundled FFmpeg binaries for packaged builds.

Place platform binaries in one of these locations:

- `resources/ffmpeg/ffmpeg.exe` (Windows fallback)
- `resources/ffmpeg/win32-x64/ffmpeg.exe`
- `resources/ffmpeg/win32-arm64/ffmpeg.exe`
- `resources/ffmpeg/linux-x64/ffmpeg`
- `resources/ffmpeg/darwin-x64/ffmpeg`
- `resources/ffmpeg/darwin-arm64/ffmpeg`

At runtime, the app sets `FFMPEG_PATH` automatically when one of these files exists in packaged `resources/ffmpeg`.

If no bundled binary is found, the app falls back to resolving `ffmpeg` from system PATH.

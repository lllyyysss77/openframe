<p align='center'>
  <img src='./apps/ui/public/logo.svg' alt='Openframe logo' width='120' />
</p>

# Openframe

Openframe is an open-source, free AI comic-drama creation studio with Web and desktop runtimes.

[中文文档](./README.md)

## Features

- End-to-end workflow: project -> script -> character/prop/scene -> shots -> production/export
- Script editor + AI assistance: autocomplete, idea-to-script generation, novel excerpt adaptation, and rewrite/polish
- Structured extraction: automatically extract characters, props, scenes, and shot data from scripts
- Character relation graph: script-based relation extraction with iterative optimization
- Shot generation: auto-generate shots and control target shot count
- Visual and video production: keyframe/shot-video generation and timeline editing
- Export options: merged video, FCPXML, and EDL (for PR/DaVinci workflows)
- AI provider configuration: independently configure models and endpoints for text, image, and video
- Storage options: local storage plus object storage via S3/COS/OSS

## Web Runtime

- Runs directly in the browser, no desktop install required
- Uses browser local storage for project persistence
- Supports AI production and export workflows

## Desktop Runtime

- Native desktop app with local-first data storage
- Supports local directory related capabilities and native export experience

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See [LICENSE](./LICENSE).

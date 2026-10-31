# Brightloop submission demo

A 3 minute 43 second product walkthrough, captured through the Codex in-app browser using real admin and customer authentication.

## Deliverables

Final files are written to `~/Downloads/Brightloop-Demo/`:

- `Brightloop-Product-Demo-4K60.mp4`: 3840 × 2880, 4:3, 60 fps, H.264/AAC.
- `Brightloop-Product-Demo-Upload.mp4`: 1920 × 1440, 60 fps, smaller submission copy.
- `Brightloop-captions.srt`: optional caption track; headlines are also embedded in the video.
- `Brightloop-preview.png`: mid-video verification frame.
- `*-verification.json`: ffprobe results.

The captures use an isolated instance of the actual application with four fictional customers. The walkthrough creates and activates a fifth subscription, generates its invoice, and records a fictional bank receipt. The live email outbox is captured separately; recipient addresses are blurred for the submission. No live business records were changed during filming.

This is an edited browser-capture film: screenshots of actual interactions are animated by the supplied renderer with editorial zooms, cursor choreography, and transitions. It is not an uninterrupted desktop recording. The 4K master is exported from a 1920 × 1440 working composition using Lanczos scaling. The original capture viewport was restored after filming.

## Coverage

Authentication; product pricing, variants and taxes; plan intervals and policies; quotation templates; draft → quotation → confirmed → active subscription lifecycle; discounts and limits; recurring billing; itemized invoices; confirmation; partial/full payment recording; receipt history; print/PDF; customer records and invitation controls; reporting and CSV export; audit trail; team roles; global search; registration and reset entry points; customer-only portal; add-ons; pause/resume and renewal controls; deployed email delivery and anti-spam limits.

The video explicitly describes payment recording as receipt reconciliation, not card processing. Email delivery evidence comes from the deployed application; the isolated workspace does not send messages.

## Reproduction

Dependencies: Python 3.11+, Pillow, NumPy, FFmpeg/ffprobe. The export script uses the available NVIDIA encoder (`h264_nvenc`); change that to a supported H.264 encoder for other machines. No paid services or third-party music are used.

1. Place the genuine browser captures in `tmp/demo-capture/`, using the filenames in `prepare_edit.py`.
2. Provide the transparent `cursor.png` asset in that same directory (32 × 48; hotspot 3,2).
3. Run `python demo-video/prepare_edit.py`.
4. Set `BRIGHTLOOP_FFMPEG` to the FFmpeg executable, then run `python demo-video/render_edit.py`.

`render_browser_demo.py` is the renderer supplied by the user. Its only source change is a configurable encoder thread limit for bounded parallel rendering. Preparation adds presentation framing and captions around genuine browser screenshots; the UI contents are not fabricated. The score is an original deterministic synthesizer composition generated locally.

`timeline.json` records the complete edit and captions. Large capture/render intermediates remain under ignored `tmp/`; final videos remain in Downloads rather than bloating Git.

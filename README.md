# Form Photo Fixer

A responsive, browser-only tool for cropping, resizing, compressing, validating, and downloading application photos and signatures. Images are decoded and processed locally with the File API and Canvas; the application does not send images to a server.

## Run it

The app has no build step or runtime dependencies. Open `index.html` in a recent browser, or serve this folder from a local static web server:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`. The app uses no external fonts, scripts, services, or APIs; once the page has loaded, image processing needs no network connection. Keep the project files available locally to reopen the app offline. No service worker is required.

## Use it

1. Select an application preset and upload a JPG/JPEG or PNG photo and/or signature. Files may also be dragged onto the upload areas.
2. Drag the photograph in the crop frame, use the zoom controls, and set output DPI. The face oval is a positioning aid; it is not face detection.
3. Use **Download Photo** or **Download Signature**. The output panel reports exact dimensions, actual generated file size, selected preset limits, format, and validation status. **Download All Files** downloads the two validated files separately (not a ZIP archive).

The sample presets are illustrative and are not verified official requirements. Confirm requirements against the relevant application notice. The default resolution is 300 DPI; dimensions in pixels are calculated as `round(cm / 2.54 × DPI)`.

## Presets

Three sample presets—Exam Form A, Exam Form B, and Job Application—are in `SAMPLE_PRESETS` in `app.js`. Each stores separate photograph and signature width, height, and maximum KB values, along with an output format. Edit those values to change the examples.

Create a reusable preset in **Custom Presets**. Its name, photo and signature dimensions and maximum sizes, and JPEG/PNG output format are saved in browser `localStorage` on this device. Existing custom presets can be selected, edited, and deleted. The selected DPI controls the pixel dimensions for both sample and custom presets.

## Image handling and limits

- The photograph is cover-cropped to the exact preset aspect ratio, without stretching. The signature is fitted inside its output frame, preserving its aspect ratio; PNG transparency is retained when PNG is selected.
- JPEG is encoded at progressively lower Canvas quality until its actual Blob is at or below the selected limit. If the limit cannot be met at the required dimensions, no downloadable result is marked ready. PNG has no quality parameter in Canvas; oversized PNG output is reported as an error rather than falsely accepted.
- Output canvas pixel dimensions remain exact for the selected physical size and DPI. The app does not silently reduce them to satisfy a file-size limit.
- Input files over 20 MB and unsupported or undecodable images are rejected with an error.
- The face guide is an alignment aid only. No facial recognition, image upload, or server processing is performed.

## Testing checklist

Use local JPG and PNG fixtures in a current desktop browser:

- Large smartphone photo: upload, move and zoom the crop, reset, choose a low-size preset, and verify exact pixel dimensions and actual size below the limit.
- Small photo: crop and download; confirm it is not stretched and the output dimensions remain exact.
- Transparent PNG signature and JPEG signature: preview and download as JPEG and PNG; confirm the chosen output format and aspect-ratio-preserving fit.
- A source file over 20 MB: confirm it is rejected. An image whose encoded output cannot fit a low maximum: confirm a clear error appears and the download remains disabled.
- Create, edit, select, and delete a custom preset; reload the page to verify localStorage persistence.
- Disconnect from the network and reload the locally served page; verify core functionality (using system fonts if the optional web font is unavailable).

All reported output sizes are measured from the actual generated Blob in bytes. Files are only shown as ready when their Blob size is strictly below the selected maximum.

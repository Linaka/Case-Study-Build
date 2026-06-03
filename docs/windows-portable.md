# Windows portable setup

Use this path when you need to run the app on Windows without admin rights or a machine-wide Node.js install.

## Quick start

From the project folder on the Windows machine, double-click:

```text
Run-Windows.cmd
```

On first run, the launcher installs everything into the project folder and then starts the app at `http://127.0.0.1:3000`.

You can also run the setup step separately:

```text
Install-Windows.cmd
Run-Windows.cmd
```

## What gets installed

The portable setup writes only inside this project folder:

- `.runtime\node`: the official portable Windows Node.js ZIP.
- `.runtime\npm-cache`: npm's local package cache.
- `.runtime\ms-playwright`: Playwright's local Chromium browser binaries for PDF and banner exports.
- `node_modules`: npm dependencies for this app.

No Windows services, registry entries, Program Files writes, global npm packages, or admin prompts are required.

## Requirements

- Windows 10 or Windows 11.
- PowerShell, which is included with Windows.
- Internet access for the first setup run so Node.js, npm packages and Playwright Chromium can be downloaded.
- Write access to the project folder.

After setup, day-to-day launching uses the local runtime. If you move the folder to another Windows computer, run `Install-Windows.cmd` again if the CPU architecture changed or if PDF/banner export reports a missing browser.

## Options

Use another port:

```text
Run-Windows.cmd -Port 3001
```

Bind to another local interface:

```text
Run-Windows.cmd -BindHost 0.0.0.0
```

Use a different portable Node.js version:

```text
Install-Windows.cmd -NodeVersion 22.16.0
```

Skip the renderer download if you only need the editor and previews:

```text
Install-Windows.cmd -SkipBrowserInstall
```

## Troubleshooting

If PowerShell script execution is restricted, use the `.cmd` launchers instead of opening the `.ps1` files directly. They set `ExecutionPolicy Bypass` for that one process only, which does not require admin rights and does not change the machine policy.

If setup is interrupted, delete `.runtime` and run `Install-Windows.cmd` again.

If the app says Playwright Chromium is missing, run:

```text
Install-Windows.cmd
```

If port `3000` is already in use, run:

```text
Run-Windows.cmd -Port 3001
```

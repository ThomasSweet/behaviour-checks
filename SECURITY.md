# Security

## Supported versions

Only the latest release receives fixes.

## What counts

The package runs inside your Playwright tests, against pages you choose. It
presses keys, clicks, and reads the page. A way for a page under test to make
the package do anything beyond that, such as run code in the Node process or
reach the file system, is a security problem. Please report it privately.

A wrong finding is not a security problem. Open an issue for it.

## How releases are published

From 0.1.1 on, every version is published by this repository's Release
workflow through npm trusted publishing, so the repository holds no npm
token. npm shows a provenance statement for each of those versions that
links it to the commit and the workflow run that built it. 0.1.0 was
published by hand and has none.

## Reporting

Use [Report a vulnerability](https://github.com/ThomasSweet/behaviour-checks/security/advisories/new)
on the repository's Security tab. Please do not open a public issue.

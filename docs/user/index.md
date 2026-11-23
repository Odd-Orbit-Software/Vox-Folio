---
title: User guide
nav_order: 2
has_children: true
---

# Getting started

## What you need

- An LG TV running webOS. Vox Folio is built for the Chromium 79 engine in webOS 6 and later.
- An Audiobookshelf server you can reach from the TV. Vox Folio is tested with Audiobookshelf 2.37.
- A way to install apps that aren't in the LG Content Store: Developer Mode, or a rooted TV with the Homebrew Channel.

## Install

**From a release.** Download the `.ipk` from [Releases](https://github.com/Odd-Orbit-Software/Vox-Folio/releases) and install it with the webOS CLI:

```sh
ares-install --device <your-tv> software.oddorbit.voxfolio_<version>_all.ipk
```

**With the Homebrew Channel.** Each release includes a manifest file. Add the release to a Homebrew Channel repository you use, and Vox Folio appears in the channel's list.

**Latest development build.** Every [CI run](https://github.com/Odd-Orbit-Software/Vox-Folio/actions/workflows/build.yml) attaches the `.ipk` it built.

## Sign in

1. Open Vox Folio. The first screen asks for your server's address, the one you'd type in a browser, for example `abs.example.com` or `http://192.168.1.20:13378`.
2. Enter your Audiobookshelf username and password. The TV's on-screen keyboard and voice input both work.

Vox Folio keeps you signed in. Your password isn't stored, only the sign-in tokens Audiobookshelf issues, and those renew on their own.

## Profiles ★

Several people can share one TV. Each person signs in with their own Audiobookshelf account and gets their own place in every book, their own Home, settings and listening stats.

- Add someone from **Who's listening?** with **Add someone**, or from the profile button at the top of the side rail.
- When Vox Folio starts with more than one profile, it asks who's listening. It remembers who chose last.

Features marked ★ are part of Vox Folio Premium, which is planned. They're all unlocked for now.

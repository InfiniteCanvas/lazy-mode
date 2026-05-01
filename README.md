# Lazy Mode

A SillyTavern extension that generates AI-powered action suggestions for your character. Inspired by [SillyTavern-Roadway](https://github.com/bmen25124/SillyTavern-Roadway), styled with TunnelVision's design language.

## What It Does

Ever stare at the chat input box, unsure what your character should do next? Lazy Mode fixes that. Click the 🛋️ button on any AI message, and the extension will:

1. Send your chat context to an AI (either your main API or a separate connection profile)
2. Generate 4 creative action suggestions tailored to the current scene
3. Display them as interactive cards you can:
   - **Use** → Insert directly into the input box
   - **Edit** → Modify the suggestion inline
   - **Impersonate** → Let the AI write as your character based on the suggestion

## Features

- **One-click suggestions** → 🛋️ button on every AI message
- **Customizable prompt** → Configure what kind of suggestions you want
- **Separate API support** → Use a cheaper/faster model for suggestions via connection profiles
- **Auto-trigger** → Automatically generate suggestions on new AI messages
- **Inline editing** → Tweak suggestions before using them
- **Auto-send** → Optionally send messages immediately when using a suggestion

## Installation

1. Copy this folder to `SillyTavern/public/scripts/extensions/third-party/`
2. Restart SillyTavern or reload extensions
3. Find "Lazy Mode" in your Extension Settings

## Usage

1. Enable the extension in Extension Settings
2. Click the 🛋️ button on any AI message
3. Wait for suggestions to generate
4. Click **Use**, **Edit**, or **Impersonate** on any suggestion card

## Settings

| Setting | Description |
|---------|-------------|
| Enable Lazy Mode | Master toggle |
| Suggestion Prompt | Customize the AI prompt used to generate suggestions |
| Connection Profile | Use a separate API profile for suggestions (optional) |
| Max Response Tokens | How many tokens the AI can use |
| Number of Suggestions | How many suggestions to generate (1-10) |
| Auto-generate | Automatically generate on new messages |
| Auto-open | Auto-expand the suggestions panel |
| Show "Use" button | Show/hide the use button |
| Auto-send on "Use" | Automatically send when using a suggestion |
| Allow editing | Enable inline editing of suggestions |

## Credits

- Inspired by [SillyTavern-Roadway](https://github.com/bmen25124/SillyTavern-Roadway)
- Styled after [TunnelVision](https://github.com/Coneja-Chibi/TunnelVision)

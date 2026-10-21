# Connector logos

Bundled for connector identification, retrieved 2026-10-20 from each brand's official site or asset host below. Marks belong to their respective owners; inclusion does not imply endorsement. No runtime downloads, generated brand logos, or third-party logo CDN dependency. The file name is the catalog `logo` id (`fix-con-cli/src/rinari/mcp/catalog.json`), registered in `src/features/connectors/ConnectorLogo.tsx`.

| Files | Official source | Notes |
| --- | --- | --- |
| `notion.png` | [Notion](https://www.notion.com) — [iOS icon](https://www.notion.com/front-static/logo-ios.png) | Original PNG. |
| `linear.svg` | [Linear](https://linear.app) — [favicon](https://linear.app/static/favicon.svg?v=2) | Original SVG. |
| `todoist.png` | [Todoist](https://www.todoist.com) — [192 px icon](https://www.todoist.com/static/android-chrome-192x192.png) | Original PNG. |
| `airtable.png` | [Airtable](https://www.airtable.com) — [touch icon](https://www.airtable.com/images/favicon/baymax/apple-touch-icon.png) | Original PNG. |
| `sentry.svg` | [Sentry branding](https://sentry.io/branding/) — [white glyph](https://sentry-brand.storage.googleapis.com/sentry-glyph-white.svg) | Official path unchanged; the viewBox is cropped to a square around the glyph (the original has wide empty margins). |
| `canva.png` | [Canva](https://www.canva.com) — [180 px touch icon](https://static.canva.com/domain-assets/canva/static/images/apple-touch-180x180-1.png) | Original PNG. |
| `clickup.png` | [ClickUp](https://clickup.com) — [touch icon](https://clickup.com/favicons/apple-touch-icon.png) | Original PNG. |
| `vercel.png` | [Vercel](https://vercel.com) — [256 px touch icon](https://assets.vercel.com/image/upload/q_auto/front/favicon/vercel/apple-touch-icon-256x256.png) | Original PNG. |
| `supabase.svg` | [Supabase](https://supabase.com) — [favicon](https://supabase.com/favicon/favicon.svg) | Original SVG. |
| `stripe.svg` | [Stripe](https://stripe.com) — [favicon](https://images.stripeassets.com/fzn2n1nzq965/1hgcBNd12BfT9VLgbId7By/01d91920114b124fb4cf6d448f9f06eb/favicon.svg) | Original SVG. |
| `figma.svg` | [Figma](https://www.figma.com) — [favicon](https://static.figma.com/app/icon/2/favicon.svg) | Original SVG. |
| `dropbox.svg` | [Dropbox](https://www.dropbox.com) — [glyph](https://cfl.dropboxstatic.com/static/images/logo_catalog/glyph_m1.svg) | Official paths unchanged; the original has no fill, so an explicit Dropbox Blue (`#0061FF`) root fill was added for rendering on dark surfaces. |
| `atlassian.png` | [Atlassian](https://www.atlassian.com) — [touch icon](https://www.atlassian.com/apple-touch-icon.png) | Original PNG. |
| `elevenlabs.svg` | [ElevenLabs](https://elevenlabs.io) — [icon](https://elevenlabs.io/icon.svg) | Original SVG. |
| `slack.png` | [Slack](https://slack.com) — [favicon](https://slack.com/favicon.ico) | The 256 px frame of the official ICO, converted losslessly to PNG. |
| `asana.png` | [Asana](https://asana.com) — [1200 px logo](https://assets.asana.biz/m/5f083bc48e06e1e2/original/asana-logo-1200x1200.png) | Cropped to the three-dot symbol (the dark wordmark below it is unreadable on the app's dark surfaces) and downscaled to 256 px; colors unchanged. |
| `hubspot.png` | [HubSpot](https://www.hubspot.com) — [favicon](https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png) | Original PNG. |
| `github.svg` | [GitHub iconography](https://brand.github.com/graphic-elements/iconography), [Primer Octicons mark-github-24.svg](https://github.com/primer/octicons/blob/97825f832c98f817867f770d084c08e3edc6f78c/icons/mark-github-24.svg) | Official paths/viewBox unchanged; explicit white root fill for dark surfaces. Octicons MIT license in `../github-copilot-LICENSE.txt`. |
| `google-workspace.png`, `google-gmail.png`, `google-drive.png`, `google-docs.png`, `google-sheets.png`, `google-slides.png`, `google-calendar.png`, `google-chat.png`, `google-people.png` | Google product branding on `www.gstatic.com/images/branding/product/2x/`: `googleg_48dp.png`, `gmail_2020q4_48dp.png`, `drive_2020q4_48dp.png`, `docs_2020q4_48dp.png`, `sheets_2020q4_48dp.png`, `slides_2020q4_48dp.png`, `calendar_2020q4_48dp.png`, `chat_2020q4_48dp.png`, `contacts_2022_48dp.png` | Original 96 px PNGs. Google Workspace uses the Google "G"; Google People uses the Contacts icon (the People API is Contacts). |
| `postgres.png` | [PostgreSQL press kit](https://www.postgresql.org/about/press/) — [elephant](https://www.postgresql.org/media/img/about/press/elephant.png) | Original PNG. |
| `sqlite.svg` | [SQLite](https://www.sqlite.org) — [banner](https://www.sqlite.org/images/sqlite370_banner.svg) | Official paths unchanged; the viewBox is cropped to the square-and-feather symbol, leaving out the «SQLite» wordmark (unreadable at icon size). SQLite is in the public domain. |

## Generic icons

| Files | Source |
| --- | --- |
| `mcp-remote.png`, `mcp-local.png` | Made for Rinari with Codex CLI (`imagegen`), reviewed by hand and downscaled to 256 px. Not brand marks: they stand for any remote or local MCP server outside the catalog. |

# Guides Data

Static JSON & assets for [guides.ekaterinburg.city](https://guides.ekaterinburg.city).

- `/_notion-updater` — Node.js Notion client
- `/assets` — folder with assets links
- `/data` - tree structure with Notion blocks data and assets links

## Development

1. Install Node.js

2. Create `.env` with `NOTION_TOKEN=<token>`

3. Run build script:

```sh
npm run build

# Or force update data mode
npm run build-full
```

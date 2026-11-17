# Horses Benchmark

A catalog of interactive 3D horses built from a shared prompt. [Open the catalog](https://horses.adelnz.com/).

## Prompt

> "create a realistic interactive 3d horse with three.js. from scratch, no reusing of existing licensed stuff. verify using [@Browser](plugin://browser@openai-bundled) "

## Models

- [`62solmax`](./62solmax/) builds a procedural bay horse with close-up views and animated gaits. [Open 62solmax](https://horses.adelnz.com/62solmax/).

## Development

```sh
npm ci
npm run dev
```

`npm run build` writes the catalog and model pages to `dist/`. `npm run preview` serves that build locally.

## License

[MIT](./LICENSE)

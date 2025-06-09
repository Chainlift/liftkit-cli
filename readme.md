# `liftkit`

A lightweight CLI tool to simplify component management and configuration for your Next.js project.

> **Note:** `liftkit` is currently a wrapper around the [shadcn/ui CLI](https://github.com/shadcn-ui/ui). This dependency is temporary and will be removed in a future version.

## 🚀 Installation

Install `liftkit` as a development dependency:

```bash
npm install @chainlift/liftkit --save-dev
```

## 🛠️ CLI Usage

Run `liftkit --help` to view available commands:

```bash
npx liftkit --help
```

### Initialize Your Project

Set up your Next.js repo with sensible defaults using:

```bash
npx liftkit init
```

### Add Components

Use the `add` command to import components from a remote LiftKit JSON manifest:

```bash
liftkit add https://liftkit.pages.dev/all.json
```

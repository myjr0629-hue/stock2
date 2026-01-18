---
description: how to build and deploy the application
---

# Build & Deploy Workflow

## 1. TypeScript Build Check
// turbo
```bash
npx tsc --noEmit
```

## 2. Git Add & Commit
```bash
git add -A
git commit -m "feat: <description>"
```

## 3. Push to GitHub (triggers Vercel auto-deploy)
```bash
git push
```

## Notes
- Vercel auto-deploys on push to main branch
- Check deployment status at: https://vercel.com/dashboard

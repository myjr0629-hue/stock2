---
description: how to build and deploy the application
---

# Build & Deploy Workflow

## 1. TypeScript Build Check
// turbo
```bash
npx tsc --noEmit
```

## 2. ESLint Check (Optional)
```bash
npx next lint
```

## 3. i18n Key Validation
Verify all three language files have the same number of keys:
```powershell
(Get-Content src/messages/ko.json | Select-String '":').Count
(Get-Content src/messages/en.json | Select-String '":').Count
(Get-Content src/messages/ja.json | Select-String '":').Count
```
> All three counts should be identical.

## 4. Git Add & Commit
```bash
git add -A
git commit -m "feat: <description>"
```

## 5. Push to GitHub (triggers Vercel auto-deploy)
// turbo
```bash
git push
```

## Post-Deploy Verification
- [ ] Vercel deployment status: https://vercel.com/dashboard
- [ ] Language switching works (ko/en/ja)
- [ ] Core pages load without errors (Guardian, Command, Intel)
- [ ] Mobile view renders correctly


# CounterSign app

The web front end: browse claims and auditor pages, post and re-check claims,
withdraw, retry or close a read, and collect what the Board owes you.

- Design: the owner's reference (koyeb.com's layout) with CounterSign's own
  name and mark, and one accent, forest green `#51735C` (a lighter tint,
  `#8FB79B`, for text on dark sections).
- Data: every read and write goes through `../client/countersign.mjs`; the
  app holds no contract logic of its own. Networks: Studio and Studio Next;
  Bradbury is listed but disabled until CounterSign is deployed there.
- Wallet: any browser wallet (EIP-1193). The app asks it to switch to, or
  add, the selected network before a write.

```
npm install && npm --prefix ../client install
npm run dev        # http://localhost:5173
npm run build      # dist/
```

On Vercel, set the project root to `app/`; `vercel.json` installs the client
module too.

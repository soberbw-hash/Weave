const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { atomic, TYPES } = require("./project-repository.cjs");
function overlap(a, b) {
  const rel = path.relative(a, b);
  const back = path.relative(b, a);
  return (
    !rel ||
    (!rel.startsWith("..") && !path.isAbsolute(rel)) ||
    (!back.startsWith("..") && !path.isAbsolute(back))
  );
}
class InboxReceipts {
  constructor(repo) {
    this.repo = repo;
    this.file = path.join(repo.userData, "inbox-receipts.json");
    if (!fs.existsSync(this.file)) atomic(this.file, {});
  }
  validate(folder) {
    const canonical = fs.realpathSync(folder);
    if (!fs.statSync(canonical).isDirectory())
      throw new Error("Inbox must be a folder");
    if (
      overlap(canonical, this.repo.userData) ||
      this.repo.listProjects().some((p) => overlap(canonical, p.root))
    )
      throw new Error(
        "收件箱不能位于项目或应用数据目录内，也不能包含它们；请选择独立文件夹。",
      );
    return canonical;
  }
  receipt(file) {
    if (
      !TYPES[path.extname(file).toLowerCase()] ||
      fs.lstatSync(file).isSymbolicLink()
    )
      return null;
    const canonical = fs.realpathSync(file);
    const s = fs.statSync(canonical);
    if (!s.isFile()) return null;
    return {
      file: canonical,
      key: crypto
        .createHash("sha256")
        .update(
          `${process.platform === "win32" ? canonical.toLowerCase() : canonical}\0${s.size}\0${s.mtimeMs}`,
        )
        .digest("hex"),
      size: s.size,
      mtimeMs: s.mtimeMs,
    };
  }
  known(key) {
    return !!JSON.parse(fs.readFileSync(this.file, "utf8"))[key];
  }
  mark(receipts) {
    this.repo.withLocalLock(() => {
      const all = JSON.parse(fs.readFileSync(this.file, "utf8"));
      for (const receipt of receipts)
        all[receipt.key] = { receivedAt: new Date().toISOString() };
      atomic(this.file, all);
    });
  }
  baseline(folder) {
    folder = this.validate(folder);
    const receipts = [];
    const visit = (file) => {
      const s = fs.lstatSync(file);
      if (s.isSymbolicLink()) return;
      if (s.isDirectory()) {
        for (const n of fs.readdirSync(file)) visit(path.join(file, n));
      } else {
        const r = this.receipt(file);
        if (r) receipts.push(r);
      }
    };
    visit(folder);
    this.mark(receipts);
  }
  receive(file) {
    this.repo.reconcileReceiveShot();
    const settings = this.repo.settings();
    if (!settings.inboxPath) return null;
    const folder = this.validate(settings.inboxPath);
    const r = this.receipt(file);
    if (!r || this.known(r.key)) return null;
    const rel = path.relative(folder, r.file);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel))
      throw new Error("Inbox file is outside selected folder");
    const projectId =
      settings.receiveProjectId ||
      this.repo.registry().activeProjectId ||
      this.repo.listProjects().find((p) => p.publicInbox)?.id;
    if (!projectId) throw new Error("No receiving project is available");
    const snapshot = this.repo.importFiles({
      projectId,
      paths: [r.file],
      shotId: settings.receiveShotId || undefined,
    });
    const after = this.receipt(file);
    if (after?.key === r.key) this.mark([r]);
    return snapshot;
  }
}
module.exports = { InboxReceipts, overlap };

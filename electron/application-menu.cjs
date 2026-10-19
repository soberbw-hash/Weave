function applicationMenuTemplate() {
  return [
    {
      label: "文件",
      submenu: [
        { role: "close", label: "关闭窗口" },
        { type: "separator" },
        { role: "quit", label: "退出 Weave" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新载入" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大界面" },
        { role: "zoomOut", label: "缩小界面" },
        { type: "separator" },
        { role: "togglefullscreen", label: "全屏" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "最大化／还原" },
        { role: "close", label: "关闭窗口" },
      ],
    },
  ];
}
module.exports = { applicationMenuTemplate };

# HarmonyOS Sans SC

Source: [Huawei official HarmonyOS design resources](https://developer.huawei.com/consumer/cn/design/resource-V1/), font package link: https://developer.huawei.com/images/download/general/HarmonyOS-Sans.zip

Retrieved 2026-10-15. Files are copied byte-for-byte from `HarmonyOS Sans/HarmonyOS_Sans_SC/` in the official archive, without subsetting, conversion, renaming or glyph changes. Regular, Medium and Bold support the UI's existing weight hierarchy. Other scripts or emoji outside these files' character coverage may use browser fallbacks.

Copyright 2021 Huawei Device Co., Ltd. Licensed under the accompanying original `LICENSE.txt`. Weave also displays the font attribution and full license under Settings / 字体与许可.

SHA-256:

- Regular: `297b088424be212207df2ce8b98e335468b782aa6b96832af0b8b773d711e2b1`
- Medium: `6ed1553edccddc48eb27ff25d134a4a715cf54211238d4840b3038576cba1944`
- Bold: `43a424b85e47fb53a17b3b32026a71801f86f8e022ca6798d186b47d39fa5f01`
- Original license: `b2ffec0e6269ee41c3b5fc0345ab37600b46d66ebea6c9c58ff37f517bdfa164`

Standalone browser HTML embeds the original font bytes so a single file remains usable offline. The internally hosted entry uses local font files for caching. Normal Vite builds package local font assets. There is no runtime font CDN, system-font installation or external font request.

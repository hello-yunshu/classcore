> 中文说明：本文件保留英文协议细节与英文标识符；当前中文总说明见同目录 `README.md`，长期开发以中文主计划为准。

# Education Interoperability Boundary v0.1.2

The internal domain model remains independent of external standards. Standards are adapters at the platform edge.

Future gateways MAY include:
- OneRoster: roster, class membership, resources, grades.
- LTI 1.3 / LTI Advantage: secure launch of remote learning tools, roles, deep linking and grade services.
- QTI: import/export portable assessment items and tests.
- xAPI / Caliper: export internal Accepted Domain Events into external learning analytics vocabularies/LRS endpoints.
- Common Cartridge: import/export packaged learning materials.

Hard rule: adopting an external standard MUST NOT replace `Lesson / Activity / Applet / Event` as the internal runtime model. Use anti-corruption/adaptor layers so external schema changes do not ripple through classroom runtime code.

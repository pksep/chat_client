## [1.59.2](https://github.com/pksep/chat_client/compare/v1.59.1...v1.59.2) (2026-11-26)


### Bug Fixes

* preserve external apps when stopping desktop agent [skip ci] ([c501769](https://github.com/pksep/chat_client/commit/c5017691e01710dc3a7af216fc5f9aaa164d3e17))

## [1.59.1](https://github.com/pksep/chat_client/compare/v1.59.0...v1.59.1) (2026-11-26)


### Bug Fixes

* restore desktop folder access and release agent locks on update [skip ci] ([4643779](https://github.com/pksep/chat_client/commit/4643779804e9f6cd76f7b7ce8f05f7c00a5e6ffb))

# [1.59.0](https://github.com/pksep/chat_client/compare/v1.58.2...v1.59.0) (2026-11-26)


### Features

* **tauri:** improve calls, updates, AI and stickers (CHAT-564) [skip ci] ([1058bc9](https://github.com/pksep/chat_client/commit/1058bc9022bdf93735ff72224d18c48ef9eca8cf))

## [1.58.2](https://github.com/pksep/chat_client/compare/v1.58.1...v1.58.2) (2026-11-26)


### Bug Fixes

* **ai:** display assistant replies at full width ([76e6a95](https://github.com/pksep/chat_client/commit/76e6a9571116831d259d62a4491282a11d4e994c))

## [1.58.1](https://github.com/pksep/chat_client/compare/v1.58.0...v1.58.1) (2026-11-26)


### Bug Fixes

* unify pinned comment editor modal [skip ci] ([ab69785](https://github.com/pksep/chat_client/commit/ab69785189f6c6161778fd6d3d1403bfe770c83c))

# [1.58.0](https://github.com/pksep/chat_client/compare/v1.57.0...v1.58.0) (2026-11-26)


### Features

* добавлен поиск моделей с тегами провайдеров ([f727bcd](https://github.com/pksep/chat_client/commit/f727bcdff853d806ed95b54fe582e1ddee33e82d))

# [1.57.0](https://github.com/pksep/chat_client/compare/v1.56.3...v1.57.0) (2026-11-25)


### Bug Fixes

* **ai:** keep mixed conversation history in chronological order ([01515c5](https://github.com/pksep/chat_client/commit/01515c53220bfe711680bda93a3834ea9fb6dd88))
* **ai:** keep welcome shortcuts inside narrow chat panes ([c976b9a](https://github.com/pksep/chat_client/commit/c976b9a540a6e6496dae3bc930123d54fa818e62))
* **ai:** preserve user prompts when server replies are incomplete ([03285c7](https://github.com/pksep/chat_client/commit/03285c799e03557e8358792c250a9030a58ed791))
* **ai:** restore execution status in menus after reload ([8c34d4e](https://github.com/pksep/chat_client/commit/8c34d4e50ce8c820e33ebc8f0d13f335909fb012))
* keep the mobile AI folder strip within the menu width ([7c2e682](https://github.com/pksep/chat_client/commit/7c2e682486c1defcdf2cac25d64a0ddc5b66996b))
* **menu:** keep unread badges circular and verify the 9+ cap ([5a4b665](https://github.com/pksep/chat_client/commit/5a4b66525c2b1e0cd15aed1776a9fb74a71425c3))
* reject invalid cached server configuration [skip ci] ([8acd3d7](https://github.com/pksep/chat_client/commit/8acd3d7d01dbccbefb0244866e1349913cabe751))
* **tauri:** preserve screen share clarity ([#507](https://github.com/pksep/chat_client/issues/507)) [skip ci] ([a7af78e](https://github.com/pksep/chat_client/commit/a7af78ea408612c10044ff563a9fe1befade716d))
* **tauri:** preserve screen share clarity across call views ([3348564](https://github.com/pksep/chat_client/commit/3348564eee5e208c117d17a6e15ea7fe0f5d4671))
* **ui:** center navigation unread counters ([a187659](https://github.com/pksep/chat_client/commit/a1876594b5c83320d3fc33d2abb059c63a97d36e))
* use the current call action in the pinned conversation header ([d944e26](https://github.com/pksep/chat_client/commit/d944e266b9c555f66df1c7aa9df759090995d84b))


### Features

* add private AI chat information and attachments panel ([9aced81](https://github.com/pksep/chat_client/commit/9aced81bdc8f5f756ec323d8b08d45a8e33fcbdb))
* **ai:** integrate the desktop agent, model picker and dictation ([bfcc599](https://github.com/pksep/chat_client/commit/bfcc5994ea0411b7f84ea44c5a3b12aa28701ddf))
* **ai:** show task attribute and work log approvals ([d1c45ff](https://github.com/pksep/chat_client/commit/d1c45ffca403994ac38f0a4758a9f8927f97e522))
* **ai:** support responsive voice conversations and spoken action results ([415c8a6](https://github.com/pksep/chat_client/commit/415c8a63f72d8bb26fa270ed5535b6a1be5dcea8))
* merge reviewed AI updates and preserve desktop state ([#481](https://github.com/pksep/chat_client/issues/481)) [skip ci] ([db95d9a](https://github.com/pksep/chat_client/commit/db95d9a18da8603c6ade3df291a0de1af271cd0e))
* organize AI chats and tasks in shared folder menu ([534ffa9](https://github.com/pksep/chat_client/commit/534ffa97ad4cd3e403236d9ce401d5fe9c4b3b4b))
* show WhatsApp inquiries and reply limits in clients ([12fbb9a](https://github.com/pksep/chat_client/commit/12fbb9a47fe9c2f73669002323f861465a65865e))

## [1.56.2](https://github.com/pksep/chat_client/compare/v1.56.1...v1.56.2) (2026-11-25)


### Bug Fixes

* **calls:** adapt participant cards and quick controls to window size [skip ci] ([182fa6d](https://github.com/pksep/chat_client/commit/182fa6d4bf5f99fedfcb888f7ad0fe2145e24fa9))
* **deploy:** use matching SSH credentials and update web version [skip ci] ([5629601](https://github.com/pksep/chat_client/commit/56296018cfec9380c0005198d00e87f359efa757))
* **ui:** align pinned views and desktop dialogs [skip ci] ([5b5da3a](https://github.com/pksep/chat_client/commit/5b5da3ac073f5661d692238f725c1eb8f41ff41e))

## [1.56.1](https://github.com/pksep/chat_client/compare/v1.56.0...v1.56.1) (2026-11-25)


### Bug Fixes

* **chat-561:** open original pinned messages reliably on macOS ([#506](https://github.com/pksep/chat_client/issues/506)) ([6cb1d74](https://github.com/pksep/chat_client/commit/6cb1d746c881a8f3aa442739ffb4b6b60cdd4f0a))

# [1.56.0](https://github.com/pksep/chat_client/compare/v1.55.0...v1.56.0) (2026-11-25)


### Bug Fixes

* **chat-561:** center pinned dates with classic scrollbars ([21bbd9a](https://github.com/pksep/chat_client/commit/21bbd9a06c5eab1bf3214e469e7a33d32f257b89))
* **desktop:** cancel file downloads and keep macOS forms compact ([bf1786e](https://github.com/pksep/chat_client/commit/bf1786ef3f835c29e3435f4d0f9ccd786c920701))


### Features

* **chat-561:** add pinned messages list and pin comments ([a162e7e](https://github.com/pksep/chat_client/commit/a162e7eda92a1313e0b1b75e0562f5799a58fdc7))

# [1.55.0](https://github.com/pksep/chat_client/compare/v1.54.2...v1.55.0) (2026-11-24)


### Bug Fixes

* align profile and Tauri call layout (CHAT-559) [skip ci] ([2f61afc](https://github.com/pksep/chat_client/commit/2f61afcda7cac79cea52b0503454b6c2267ef043))
* align profile controls and keep Tauri calls below titlebar ([d27da26](https://github.com/pksep/chat_client/commit/d27da26ee5f63f2a3ef32833faba99166e215f29))
* center profile identity and allow hiding the desktop app button ([cc66e54](https://github.com/pksep/chat_client/commit/cc66e54b7f43b18b7d759fcde4a29506d92b9eca))
* center profile identity and support hiding app button (CHAT-559) [skip ci] ([42cc906](https://github.com/pksep/chat_client/commit/42cc9063788a1d19cc02d01d8971029c708bc6e0))
* **desktop:** control call devices directly and track native window activity ([ae3c38d](https://github.com/pksep/chat_client/commit/ae3c38da797c92da799a060f894462651d8e1062))
* keep call settings below the Tauri titlebar ([895762e](https://github.com/pksep/chat_client/commit/895762e831d53b0e808f12fef3f1d5a88addb5a6))
* keep call settings below the Tauri titlebar [skip ci] ([92e2a0a](https://github.com/pksep/chat_client/commit/92e2a0ad07cb51fd9ac2d0e7447a5a405f1ec9a2))
* **tauri:** expose call status and shorten Windows activity tags ([6d6a6e6](https://github.com/pksep/chat_client/commit/6d6a6e66a8017bee2e8e682c513b3e32b018fb35))


### Features

* **chat:** improve native call feedback and app handoff ([208640f](https://github.com/pksep/chat_client/commit/208640fa379d6454ad264208cd634362052d0262))
* **tauri:** add a dedicated call window and device controls ([6fb7009](https://github.com/pksep/chat_client/commit/6fb7009e53d8476722d47389af7ec9c1463524b5))

## [1.54.2](https://github.com/pksep/chat_client/compare/v1.54.1...v1.54.2) (2026-11-23)


### Bug Fixes

* keep reaction picker anchored to the message menu [skip ci] ([1549152](https://github.com/pksep/chat_client/commit/154915289a03845176d7954e745261aabb82dd50))
* preserve desktop permissions through updates and restore Windows notifications ([88b3c85](https://github.com/pksep/chat_client/commit/88b3c85a1952d1bf4a91ec585b1045b924bfa9aa))

## [1.54.1](https://github.com/pksep/chat_client/compare/v1.54.0...v1.54.1) (2026-11-20)


### Bug Fixes

* preserve desktop permissions across restarts [skip ci] ([735cfc9](https://github.com/pksep/chat_client/commit/735cfc94b92f1ec41973cca2990959f6721cb82b))

# [1.54.0](https://github.com/pksep/chat_client/compare/v1.53.7...v1.54.0) (2026-11-20)


### Bug Fixes

* isolate desktop QA protocol and autostart registration [skip ci] ([38a5954](https://github.com/pksep/chat_client/commit/38a595457ec177ecbc57f1ecb191674163f8de2a))
* open native chat before download destinations [skip ci] ([15356e3](https://github.com/pksep/chat_client/commit/15356e30f34e97375ee625183debbec05210c792))
* restore minimized notifications and native app downloads [skip ci] ([8855ab2](https://github.com/pksep/chat_client/commit/8855ab2b0098bab85152258336a81e7995d251f0))
* use one native app action and keep PWA only on iOS [skip ci] ([56e0191](https://github.com/pksep/chat_client/commit/56e01914f9dbc57a5cdd5c990c587376c32d4174))


### Features

* improve desktop launcher, inspector and notification actions [skip ci] ([45001eb](https://github.com/pksep/chat_client/commit/45001eb8b27561a5118ceb3126089f229a319edd))

## [1.53.7](https://github.com/pksep/chat_client/compare/v1.53.6...v1.53.7) (2026-11-20)


### Bug Fixes

* clear stale organization when opening desktop call links [skip ci] ([98547e9](https://github.com/pksep/chat_client/commit/98547e963cdc2249feaf3aefe02a08cf70779788))
* open call invitations through app choice on mobile ([#499](https://github.com/pksep/chat_client/issues/499)) ([880bb8f](https://github.com/pksep/chat_client/commit/880bb8fdcd5b1f02f9b258191b2a38aa5209cb18))
* prepare desktop updates silently before installation [skip ci] ([d02adee](https://github.com/pksep/chat_client/commit/d02adeec4a5ce3720746f9233f20a793f0d311bd))

## [1.53.6](https://github.com/pksep/chat_client/compare/v1.53.5...v1.53.6) (2026-11-19)


### Bug Fixes

* let macOS persist chat state before desktop updates ([aefe518](https://github.com/pksep/chat_client/commit/aefe5183a0737a0b5b226cb25bcf0c5b2b31f49f))

## [1.53.5](https://github.com/pksep/chat_client/compare/v1.53.4...v1.53.5) (2026-11-19)


### Bug Fixes

* resolve short Windows paths before migrating shortcuts ([7ff77b4](https://github.com/pksep/chat_client/commit/7ff77b4e59dc4620245d2088f534862ffca4604b))

## [1.53.4](https://github.com/pksep/chat_client/compare/v1.53.3...v1.53.4) (2026-11-19)


### Bug Fixes

* restore Windows shortcuts after the application rename ([1aff819](https://github.com/pksep/chat_client/commit/1aff81919f5f546dc7c0937c3c7cd70937acf467))

## [1.53.3](https://github.com/pksep/chat_client/compare/v1.53.2...v1.53.3) (2026-11-18)


### Bug Fixes

* keep native badges updating when tray sync fails ([b29a4e0](https://github.com/pksep/chat_client/commit/b29a4e0d4e05be9072676a6f98cbef3e8bb1a449))

## [1.53.2](https://github.com/pksep/chat_client/compare/v1.53.1...v1.53.2) (2026-11-18)


### Bug Fixes

* keep chat and bot dialogs within the desktop content area ([6a151a4](https://github.com/pksep/chat_client/commit/6a151a4f1a853cbc3c2f93ed10f58aaed248a256))

## [1.53.1](https://github.com/pksep/chat_client/compare/v1.53.0...v1.53.1) (2026-11-18)


### Bug Fixes

* preserve macOS storage name and encode Cyrillic MSI branding ([3e71734](https://github.com/pksep/chat_client/commit/3e7173431f5e260dfe9e618c1e05827dc482d624))

# [1.53.0](https://github.com/pksep/chat_client/compare/v1.52.2...v1.53.0) (2026-11-18)


### Features

* rename app to Russian brand and isolate Linux media plugins ([49fd0f9](https://github.com/pksep/chat_client/commit/49fd0f904b51b6a2d52bccf7e0af3edfd55c9b9f))

## [1.52.2](https://github.com/pksep/chat_client/compare/v1.52.1...v1.52.2) (2026-11-18)


### Bug Fixes

* fit desktop content and sidebar toggle below titlebar ([20836ba](https://github.com/pksep/chat_client/commit/20836babc65eab371ef4b75d9f856d2d82acacf8))

## [1.52.1](https://github.com/pksep/chat_client/compare/v1.52.0...v1.52.1) (2026-11-18)


### Bug Fixes

* keep desktop updates visible and refresh automatically ([c2edb56](https://github.com/pksep/chat_client/commit/c2edb56eeb70428f57a25b3aba19c466aff20a0b))

# [1.52.0](https://github.com/pksep/chat_client/compare/v1.51.3...v1.52.0) (2026-11-18)


### Features

* **profile:** скачивание Android через настраиваемый QR ([#498](https://github.com/pksep/chat_client/issues/498)) ([93d2c2c](https://github.com/pksep/chat_client/commit/93d2c2c60b482ded7aba1f63fc50b4a1ee246646))

## [1.51.3](https://github.com/pksep/chat_client/compare/v1.51.2...v1.51.3) (2026-11-18)


### Bug Fixes

* refresh desktop updates when opening profile check ([67c8515](https://github.com/pksep/chat_client/commit/67c8515c995665849befc0ac2a1ca14e10ce6ce1))

## [1.51.2](https://github.com/pksep/chat_client/compare/v1.51.1...v1.51.2) (2026-11-18)


### Bug Fixes

* **android:** открывать ссылки чата из ручной APK ([#497](https://github.com/pksep/chat_client/issues/497)) ([a824f79](https://github.com/pksep/chat_client/commit/a824f79cada07ebbd11091473384411ef6e299b3))

## [1.51.1](https://github.com/pksep/chat_client/compare/v1.51.0...v1.51.1) (2026-11-18)


### Bug Fixes

* import macOS capture delegate traits ([6b3bfa4](https://github.com/pksep/chat_client/commit/6b3bfa49f5d38e49b02af51da60cfe91738aa7a4))

# [1.51.0](https://github.com/pksep/chat_client/compare/v1.50.3...v1.51.0) (2026-11-18)


### Features

* add branded Tauri chrome and screen sharing ([a899ab5](https://github.com/pksep/chat_client/commit/a899ab589aa304939546db35da4a28b4dfde14c2))

## [1.50.3](https://github.com/pksep/chat_client/compare/v1.50.2...v1.50.3) (2026-11-18)


### Bug Fixes

* restore macOS window lifecycle and media drop zones ([e7a00f0](https://github.com/pksep/chat_client/commit/e7a00f05555ec40b84736ede5117adec055a829d))

## [1.50.2](https://github.com/pksep/chat_client/compare/v1.50.1...v1.50.2) (2026-11-18)


### Bug Fixes

* scope recording notifications to the active call ([c63b9cf](https://github.com/pksep/chat_client/commit/c63b9cfc902cddb1e7648e35f4063906d1bb9a8f))

## [1.50.1](https://github.com/pksep/chat_client/compare/v1.50.0...v1.50.1) (2026-11-17)


### Bug Fixes

* open desktop call links and restore tray notifications ([d309a6f](https://github.com/pksep/chat_client/commit/d309a6f12b3f033a58c487094d81b797cbd9df88))

# [1.50.0](https://github.com/pksep/chat_client/compare/v1.49.2...v1.50.0) (2026-11-17)


### Features

* add message receipt diagnostics and client runtime context ([6d7a462](https://github.com/pksep/chat_client/commit/6d7a462d464c3f9e59575c9dc111c9de7f46d8c8))

## [1.49.2](https://github.com/pksep/chat_client/compare/v1.49.1...v1.49.2) (2026-11-17)


### Bug Fixes

* distribute desktop updates through GitHub Releases ([15628a5](https://github.com/pksep/chat_client/commit/15628a5fe05aa1f9fc40b02ac6a92c42bb6f15c3))

## [1.49.1](https://github.com/pksep/chat_client/compare/v1.49.0...v1.49.1) (2026-11-17)


### Bug Fixes

* restore web and desktop release workflows ([1a58533](https://github.com/pksep/chat_client/commit/1a585331b683d57733a235fae40943fa787100c4))

# [1.49.0](https://github.com/pksep/chat_client/compare/v1.48.6...v1.49.0) (2026-11-17)


### Bug Fixes

* align Tauri file drop and updater profile ([be28100](https://github.com/pksep/chat_client/commit/be28100b7e8a9fe279b516110cb24134462aaf67))
* handle desktop file drops and retain upload source paths ([3ed0134](https://github.com/pksep/chat_client/commit/3ed0134c295921fa06c53893874f039191870154))
* match Android profile update layout without jumps ([1cfb79f](https://github.com/pksep/chat_client/commit/1cfb79f14947dc4ee9542e8278fe3c3bdc22a15e))
* use retina density for the macOS 1024px icon ([d919bbd](https://github.com/pksep/chat_client/commit/d919bbd48ed01c73ff3f832d6ceac382c96743e1))
* use RGBA8 desktop icons for macOS packaging ([4eada7b](https://github.com/pksep/chat_client/commit/4eada7ba0865a24cd0923ad0322b7a37aaf71561))


### Features

* enable short QR login in profile ([78cc8b9](https://github.com/pksep/chat_client/commit/78cc8b99044b04e4e7299a9b2115a7c9ee583d9c))
* integrate native Tauri files and signed desktop updates ([830385f](https://github.com/pksep/chat_client/commit/830385ff137fa110e7641f4d4d3ff6f52be2a87e))

## [1.48.6](https://github.com/pksep/chat_client/compare/v1.48.5...v1.48.6) (2026-11-13)


### Bug Fixes

* prevent sticker catalog flash on first opening ([26fa3d3](https://github.com/pksep/chat_client/commit/26fa3d3a88f349fbb5c98a376654477f8c9cd285))
* restore compact folder navigation and a single active selection ([ec9f9ec](https://github.com/pksep/chat_client/commit/ec9f9ecb35bc65c2dad1772356f5c1c9d3e0397b))

## [1.48.5](https://github.com/pksep/chat_client/compare/v1.48.4...v1.48.5) (2026-11-12)


### Bug Fixes

* refresh chat list consistently and refine profile controls ([cd45c90](https://github.com/pksep/chat_client/commit/cd45c9056d6d09fe5d8a3e2df50d9fad0c604bea))

## [1.48.4](https://github.com/pksep/chat_client/compare/v1.48.3...v1.48.4) (2026-11-11)


### Bug Fixes

* **CHAT-555:** show group delivery after the first recipient ([d54fbd9](https://github.com/pksep/chat_client/commit/d54fbd98453cad532dc95ca04bbcf833f893b491))

## [1.48.3](https://github.com/pksep/chat_client/compare/v1.48.2...v1.48.3) (2026-11-09)


### Bug Fixes

* **chat-554:** show call material errors and bump web version to 98 ([f92aba0](https://github.com/pksep/chat_client/commit/f92aba058ad3d8a0d8ac449aea41136fdf90549b))

## [1.48.2](https://github.com/pksep/chat_client/compare/v1.48.1...v1.48.2) (2026-11-09)


### Bug Fixes

* restore call topic actions and bump web version to 97 ([aeb87bb](https://github.com/pksep/chat_client/commit/aeb87bb8fb66de1c9c1392b12352fb1ccb12b482))
* smooth message navigation and stabilize context menus ([518fc03](https://github.com/pksep/chat_client/commit/518fc0385b9f372e836b722f699e4896c141b974))

## [1.48.1](https://github.com/pksep/chat_client/compare/v1.48.0...v1.48.1) (2026-11-06)


### Bug Fixes

* учитывать тёмную тему для эмодзи с цитатой ([f28a707](https://github.com/pksep/chat_client/commit/f28a70756a84d6d32149646b8b0e59d84a50319a))

# [1.48.0](https://github.com/pksep/chat_client/compare/v1.47.0...v1.48.0) (2026-11-06)


### Bug Fixes

* различать пропущенные звонки и исходящие без ответа ([33c191b](https://github.com/pksep/chat_client/commit/33c191be127390fb20e9259d863dc34063184f4b))


### Features

* обновлять веб-чат автоматически при смене дня ([dae0021](https://github.com/pksep/chat_client/commit/dae002184710bffb9db64cc7c24912860e2c095f))

# [1.47.0](https://github.com/pksep/chat_client/compare/v1.46.0...v1.47.0) (2026-11-06)


### Features

* **chat-553:** add header actions and attachment activity indicators ([727353d](https://github.com/pksep/chat_client/commit/727353de530a7ecce1a56c22e9007895877882b1))

# [1.46.0](https://github.com/pksep/chat_client/compare/v1.45.2...v1.46.0) (2026-11-06)


### Features

* **chat-552:** add delivery receipts and PWA push acknowledgements ([3cbf271](https://github.com/pksep/chat_client/commit/3cbf2719278eeda912e9709f2aad846f4c17605c))

## [1.45.2](https://github.com/pksep/chat_client/compare/v1.45.1...v1.45.2) (2026-11-06)


### Bug Fixes

* record displayed errors and request diagnostics ([d81462c](https://github.com/pksep/chat_client/commit/d81462c8997c0bd67ef306c7dbd561843d16906a))

## [1.45.1](https://github.com/pksep/chat_client/compare/v1.45.0...v1.45.1) (2026-11-06)


### Bug Fixes

* restore mobile folders ([3308554](https://github.com/pksep/chat_client/commit/3308554beb9315f994004d63bf84c17853f27655))

# [1.45.0](https://github.com/pksep/chat_client/compare/v1.44.0...v1.45.0) (2026-11-05)


### Bug Fixes

* **chat-540:** keep QR device sessions renewable after access expiry ([0bb30d1](https://github.com/pksep/chat_client/commit/0bb30d1d94d91e970a058b80f8882ca61dd46242))
* **chat-550:** temporarily disable short QR login ([860f3a7](https://github.com/pksep/chat_client/commit/860f3a75122ca0fdd751eb2e97f9f1e5de5736ac))


### Features

* add QR for autorization ([db32dab](https://github.com/pksep/chat_client/commit/db32dab69a41987ded14fe53a53a1a5e9c6c29df))

# [1.44.0](https://github.com/pksep/chat_client/compare/v1.43.0...v1.44.0) (2026-11-03)


### Bug Fixes

* **android:** send videos in background and open full file cards ([cbd37cc](https://github.com/pksep/chat_client/commit/cbd37cc39a5d72cd43ca5a221124a6323572f478))
* **auth:** keep shared chat sessions refreshed ([217cdfb](https://github.com/pksep/chat_client/commit/217cdfb2f995bdf80d5de3a22644237ea754c1a6))
* **auth:** prefer chat access token after sign-in ([ec645d9](https://github.com/pksep/chat_client/commit/ec645d9e28aca32076d7bf95858cd0bb429f3429))
* **auth:** preserve session when logout fails ([20cda82](https://github.com/pksep/chat_client/commit/20cda828468d29f413f32fc9daa17a63ac064ae8))
* bugs ([50d64e2](https://github.com/pksep/chat_client/commit/50d64e290f1e7369fc582890514d3453120242b5))
* **calls:** recover unstable connections through TURN relay ([980900c](https://github.com/pksep/chat_client/commit/980900ce844ef60e13c47725c419e137ac91249c))
* **calls:** trace LiveKit disconnect initiators ([f1cc712](https://github.com/pksep/chat_client/commit/f1cc712f0fb55d649533c0581da45930f33e119e))
* **chat-521:** recover chat connectivity and background sync ([a459d61](https://github.com/pksep/chat_client/commit/a459d61821f03afe317587c86c6990d730ea9f7b))
* **chat-532:** apply Figma message and call UI fixes ([c0c4e58](https://github.com/pksep/chat_client/commit/c0c4e58d308d280a428fbc2eaea49e4635c3e5d1))
* **chat-533:** synchronize paginated chats and stabilize startup ([a4cba6c](https://github.com/pksep/chat_client/commit/a4cba6c5a11e0d555ebd68df0f4ee82684bb45f0))
* **chat-534:** load AI schedules from restored session ([8a6a1cb](https://github.com/pksep/chat_client/commit/8a6a1cb02133a8c5d9c99f386f2da453328b8f75))
* **chat-534:** stabilize iPhone PWA viewport and attachments ([b936ed0](https://github.com/pksep/chat_client/commit/b936ed08f36f3b5e03d019184fdb7c4bc64afe9b))
* **chat-537:** center mobile connection status between header actions ([ca1b0db](https://github.com/pksep/chat_client/commit/ca1b0dbc2d29fa6d9e4e90a8dea6edc38e70a5c0))
* **chat-537:** improve iPhone PWA and message interactions ([b2047bf](https://github.com/pksep/chat_client/commit/b2047bf899b7282b11bbf14967ce7f1eb885234b))
* **chat-537:** keep menus above keyboard and restore deletion effects ([4b4f5c8](https://github.com/pksep/chat_client/commit/4b4f5c8adb0ee7c85db41e33770dd8adb934dec2))
* **chat-537:** polish iPhone PWA and unread notifications ([4c6df65](https://github.com/pksep/chat_client/commit/4c6df65a1631e13dff1f55bcf70b1550a2ad0727))
* **chat-537:** restore keyboard viewport on Pixel and preserve menu focus ([5ba9457](https://github.com/pksep/chat_client/commit/5ba9457cae021a6eb6cebc37a34a34c8cea91b6d))
* **chat-537:** stabilize Android keyboard and composer popups ([0d1de1e](https://github.com/pksep/chat_client/commit/0d1de1e4679b83d08a6de29e013382f8360ff6a4))
* **chat-538:** restore group edits, mentions and Android notifications ([3a555a5](https://github.com/pksep/chat_client/commit/3a555a5a9384548297b67449618aeccba5fe500c))
* **chat-542:** refresh ERP sessions before access tokens expire ([e5833ad](https://github.com/pksep/chat_client/commit/e5833ada797e4be38bc1a69d9d2f1acf92f10e46))
* **chat-546:** recover iPhone media and correct mobile interface ([14803e9](https://github.com/pksep/chat_client/commit/14803e94a007e10494a652908ecf73f328fd5dcb))
* **chat-546:** resolve iPhone PWA review issues ([616c5ce](https://github.com/pksep/chat_client/commit/616c5ceb0c1dd3a6851f492ddae48028c88c436b))
* **chat-546:** resolve iPhone review issues and preserve video covers ([75b01e7](https://github.com/pksep/chat_client/commit/75b01e7652847a8bde231ab2fea8b8444b727a85))
* **chat-546:** restore editor colors and stabilize media UI ([bccbc7a](https://github.com/pksep/chat_client/commit/bccbc7a346ec886cc81416b78099805672a88f63))
* **chat-546:** stabilize iPhone media, history and web notifications ([9362dae](https://github.com/pksep/chat_client/commit/9362daebdda287b9e7637c9bca2774bbb90c9f89))
* **chat-546:** use native emoji fonts in iPhone drafts ([44f102e](https://github.com/pksep/chat_client/commit/44f102e04d91f8846740fc10b74847b3284d8d52))
* **chat-549:** preserve screen sharing during call recovery ([dbeb911](https://github.com/pksep/chat_client/commit/dbeb911db21553df6a5f8b71cd7acf8557049f26))
* **chat:** handle fractional updates, unread navigation and self unpinning ([78f1188](https://github.com/pksep/chat_client/commit/78f1188a340d315cab85dceefec0e0286863de80))
* **chat:** keep iPhone PWA overlays and emoji within visible viewport ([9697886](https://github.com/pksep/chat_client/commit/9697886e7d18253e87fc3d940cc4bc43db4aebfd))
* **chat:** limit hover replies to incoming group messages ([dd406e7](https://github.com/pksep/chat_client/commit/dd406e76e5f77979490938b7d27adffa603120ee))
* **chat:** match reaction navigation icon to theme ([3fa76e6](https://github.com/pksep/chat_client/commit/3fa76e6b5598aeca3bdbf71570fe5ec758ad7c7f))
* **chat:** reply on desktop double click in empty message areas ([5b80ae2](https://github.com/pksep/chat_client/commit/5b80ae217a669cf350707b4db614cc509867a92c))
* **chat:** restore iOS PWA controls and persist group edits ([9b84120](https://github.com/pksep/chat_client/commit/9b841200b84355df992635798cf1ef4427d2f38e))
* **chat:** stabilize iOS PWA, unread navigation and PTS recovery ([8c7b244](https://github.com/pksep/chat_client/commit/8c7b244933e13f3518e6eb989a8517ff605badd6))
* **chat:** stabilize session refresh, push cleanup, and network status ([f9ca7aa](https://github.com/pksep/chat_client/commit/f9ca7aab7fa4108492c43cb93c9b415534cef30f))
* **chat:** synchronize message status and deletion across devices ([012fcc6](https://github.com/pksep/chat_client/commit/012fcc69a03fbcec9662d714a7072f26904ebb26))
* **clients:** cap unread badges and hide internal membership messages ([c80af2b](https://github.com/pksep/chat_client/commit/c80af2b3393615ab9d8db78cb6fa12589f3f23ab))
* **docker:** normalize static permissions and bump web update to 79.5 ([f44bb04](https://github.com/pksep/chat_client/commit/f44bb042d34a1076bec14ae65b54076bfec8ec4f))
* improve mobile offline behavior and fresh history entry ([3337b04](https://github.com/pksep/chat_client/commit/3337b04eb7dc3f8ea6240d89f08cfc4dafe5c755))
* keep AI failure messages next to their requests ([feedcca](https://github.com/pksep/chat_client/commit/feedcca22e3b74a8a7567ea32456430007367d01))
* load external customer avatars without CORS fetch ([a353234](https://github.com/pksep/chat_client/commit/a353234ece0051cfbc5b8a41f72588aed4a2ffcf))
* **messages:** recover history and pending text after connection failures ([bc22947](https://github.com/pksep/chat_client/commit/bc229472ff87bcaa342850b85cf400c716d7f646))
* reconnect ([98abc10](https://github.com/pksep/chat_client/commit/98abc10d3aad752d2ad92bd794d79735fa61e6bb))
* stabilize private inquiry media previews ([94be016](https://github.com/pksep/chat_client/commit/94be016e522bfd6ac231a51611d9af74337920ce))
* **startup:** open recent chats early and reconcile stale history ([7dce0f6](https://github.com/pksep/chat_client/commit/7dce0f66e1e6ec92f5dbac949c0d3f4458409ed9))
* **telemetry:** collect location by default without profile checkbox ([f11808e](https://github.com/pksep/chat_client/commit/f11808e3987f8f7a6afbeb4c3a7eb5a6f07f64da))
* **telemetry:** request location during app startup ([90ddbfb](https://github.com/pksep/chat_client/commit/90ddbfb2178777d075947b41acdd866ea21ec926))
* **telemetry:** retain upload diagnostics and readiness changes ([6aefb35](https://github.com/pksep/chat_client/commit/6aefb3572c6f3a4daa070eb47a153faaf4f6cfd0))
* use the official MAX icon for client channels ([d994f21](https://github.com/pksep/chat_client/commit/d994f212bee0064d3757560b34c604aee5de0807))
* versions ([069ab5d](https://github.com/pksep/chat_client/commit/069ab5d46838d57e6a115e87226c7273522d0bdc))
* web version ([3278ca0](https://github.com/pksep/chat_client/commit/3278ca0f6dab453931310f0f144cc38a5a8feb6e))


### Features

* **auth:** support shared auth sessions ([d0206dc](https://github.com/pksep/chat_client/commit/d0206dc6520a0efd94988863870d6da18c416bac))
* **calls:** collect correlated WebRTC diagnostics ([3ae4902](https://github.com/pksep/chat_client/commit/3ae490226474d1d9555f8c337243a489b520f77f))
* **calls:** trace connection lifecycles and browser tabs ([e9092ce](https://github.com/pksep/chat_client/commit/e9092ce9c7dbf6da1595bf60c50ea000c8502fc1))
* **chat:** integrate server stickers and finish message fixes ([493bfa6](https://github.com/pksep/chat_client/commit/493bfa625184ec9c24b9b2511ea84c8a5fe80dc6))
* **erp-725:** honor authorization login mode in client ([a066c7e](https://github.com/pksep/chat_client/commit/a066c7e3d36cae4f9395ad5d413b0f343123c9a2))
* **ERP-828:** support short QR login links ([1fc85ea](https://github.com/pksep/chat_client/commit/1fc85eab4ccb0b9cdd6ee0d9584927acb108c192))
* refresh customer details after saving ERP contact ([1ebe32a](https://github.com/pksep/chat_client/commit/1ebe32a5961db9d7a4bc5322db139ad76929fdf5))
* show Telegram and MAX channels in client chats ([4c5c2c5](https://github.com/pksep/chat_client/commit/4c5c2c53ee2dfae560cda971df373968d47661d7))
* **telemetry:** add location, topic state and update diagnostics ([78c6607](https://github.com/pksep/chat_client/commit/78c6607d1f09c273ac7b037a1289d4c991c637e5))
* upgrade stickers ([de17980](https://github.com/pksep/chat_client/commit/de17980dcdd9caadbd0e7781b77b2bd7870dfb0e))
* upgrade stickers and fix back event ([8fad712](https://github.com/pksep/chat_client/commit/8fad712b8cf9e640d8472bb3f211c2ef6e3f443c))
* удаление клиентских чатов с сохранением истории ([46d2d3b](https://github.com/pksep/chat_client/commit/46d2d3bc7cb11536d3baf0f16d94b1d0f5b61ee6))


### Reverts

* **docker:** restore previous static permission handling ([0e9c109](https://github.com/pksep/chat_client/commit/0e9c1094ec243aa3626cd4e021a1f0706b0430c3))

# [1.43.0](https://github.com/pksep/chat_client/compare/v1.42.0...v1.43.0) (2026-10-08)


### Bug Fixes

* **chat:** detect network loss promptly and truncate profile details ([ad1a922](https://github.com/pksep/chat_client/commit/ad1a922f3c179b0b87d4afa231453f931f5f90d0))
* **folders:** keep mobile search and folders pinned while scrolling ([e0cdee7](https://github.com/pksep/chat_client/commit/e0cdee795679b08ed9ad9639784693f670a5fa7f))
* keep support unread badges circular ([2c676b2](https://github.com/pksep/chat_client/commit/2c676b22706eaca007124ddff75f3c81228c1496))
* preserve confirmed chat access during refresh failures ([735184c](https://github.com/pksep/chat_client/commit/735184c6a408b0b219740062067bb273142c4450))


### Features

* **chat:** add animated stickers and emoji with UI fixes ([f795960](https://github.com/pksep/chat_client/commit/f795960e1cb17ca14e3b45678ae0d6e8e69968fe))

# [1.42.0](https://github.com/pksep/chat_client/compare/v1.41.0...v1.42.0) (2026-10-07)


### Bug Fixes

* add FCM delivery for Android notifications ([ac88805](https://github.com/pksep/chat_client/commit/ac88805df1c9119ed08168fb0d3eaf6c89d6c42b))
* ai activity item padding ([35bd004](https://github.com/pksep/chat_client/commit/35bd004ce0ccda1b511ba69e5bb670d1f72010d7))
* **ai:** align creation menu labels and icons with Figma ([84f0b96](https://github.com/pksep/chat_client/commit/84f0b96e73063a7770e18d08d1fa4f260cafbd63))
* align chat interface states with designs ([a763abf](https://github.com/pksep/chat_client/commit/a763abfa8c147aa4f2bcff7626953bb55841d35d))
* **android:** close folders and overlays before leaving screens ([6603624](https://github.com/pksep/chat_client/commit/660362483eea0318eb4ece41ed3f1e5a497bd93e))
* **android:** keep composer visible while editor loads ([9c824ee](https://github.com/pksep/chat_client/commit/9c824ee376123d49d419ee5559873b682339fd1b))
* **android:** open notifications with saved theme ([73d1358](https://github.com/pksep/chat_client/commit/73d1358481ef697b6c1083019d37c7afad2f53c1))
* **android:** preserve themed launch appearance ([f4ec17a](https://github.com/pksep/chat_client/commit/f4ec17a7147ad358389baaeacec4605cdca40a97))
* **android:** sync status bar with theme surface ([e349f0e](https://github.com/pksep/chat_client/commit/e349f0e7647a45914aeac926b1abd269f686eac2))
* **android:** use dark brand icon for notifications ([b4602bb](https://github.com/pksep/chat_client/commit/b4602bbfe76ca5cbbe223fbd6fe14eab669fb1d5))
* **auth:** restore logo layout ([a2edd87](https://github.com/pksep/chat_client/commit/a2edd87b86ea78c50930691764e5567aa197bae9))
* **call:** resume blocked remote audio playback ([e39b6e2](https://github.com/pksep/chat_client/commit/e39b6e259af9891211fa1aa45456005c37b1fcf1))
* **calls:** keep participant cards visible during room reconnect ([eabe95b](https://github.com/pksep/chat_client/commit/eabe95b3cb3bb9842eed64ff4685c77255bc238c))
* **calls:** pulse recording controls between Figma colors ([639d2bb](https://github.com/pksep/chat_client/commit/639d2bb8e5787716e643a234487a915b86053df5))
* **chat:** match empty selection background to Figma themes ([f7d3ee0](https://github.com/pksep/chat_client/commit/f7d3ee0527ed47eb22839170f93c5ca098505104))
* cleanup push notifications on logout ([56f0b1f](https://github.com/pksep/chat_client/commit/56f0b1f15023175af9f4191151985ff66ccc97cb))
* collapse menyu and styles ([6cafa06](https://github.com/pksep/chat_client/commit/6cafa06e5370a970b40b7bbfe26c7acad82de0b3))
* **desktop:** align topic hover dividers ([05fe02c](https://github.com/pksep/chat_client/commit/05fe02ce60e1594ea61c0b86a84e8515e5c6be61))
* **folders:** gray unread badges when all unread chats are muted ([72fa1bb](https://github.com/pksep/chat_client/commit/72fa1bb364c1deced7fe0ea466f03e9e8dca5444))
* **folders:** keep mobile topic context menus clickable ([af8ce0a](https://github.com/pksep/chat_client/commit/af8ce0a6d67999c88eac766ae442434ebfe641a7))
* group join ([937c0f4](https://github.com/pksep/chat_client/commit/937c0f437936040e34db0f355525a09ed3d8fa4a))
* **groups:** align creation flow and participant controls with Figma ([3e61d55](https://github.com/pksep/chat_client/commit/3e61d550738cb6928901096798389a482f4272e4))
* **groups:** match participant dividers and spacing to chat list ([b3de133](https://github.com/pksep/chat_client/commit/b3de133289bebb554be1a038f25c8cbedfab3560))
* **groups:** remove participant hover transition ([976aa6f](https://github.com/pksep/chat_client/commit/976aa6fe430a8169c4a2ec75e79c7fc437b3e39f))
* ignore stale incoming calls ([c839726](https://github.com/pksep/chat_client/commit/c83972671300d1c6dd7814285a123021d8015ceb))
* ignore stale incoming calls ([c4a99a0](https://github.com/pksep/chat_client/commit/c4a99a06e071f0e74395641a81dc7ff10e5b8854))
* incoming call only in dm ([3698f06](https://github.com/pksep/chat_client/commit/3698f06ef255a5a72ae3f6fa66c81ccf9edd9296))
* incoming call only in dm ([5892adb](https://github.com/pksep/chat_client/commit/5892adbd4685f9255935bfafcb10a23dd9c376f4))
* invite calls ([91bce44](https://github.com/pksep/chat_client/commit/91bce44736e8e818a4c4711c3c3dd775b88c122e))
* lint ([e85f465](https://github.com/pksep/chat_client/commit/e85f4657714002d924145e124bd7611a5ffa1ffe))
* lint ([6270d65](https://github.com/pksep/chat_client/commit/6270d65a6af2d23ac64871582a08a9760ce2db6f))
* lint ([c1ca952](https://github.com/pksep/chat_client/commit/c1ca952f82c44ab4e7b497aadc884c794c7699d9))
* make built chat assets readable by nginx ([084f6ac](https://github.com/pksep/chat_client/commit/084f6ac87e8b161d301653c10c2335fe09feda21))
* **manager:** preserve clients section on return to conversation list ([970b411](https://github.com/pksep/chat_client/commit/970b411facba1c1ac0c0896ddd951626c3f841b1))
* **manager:** retain canonical canary navigation synchronization ([4bbfc5f](https://github.com/pksep/chat_client/commit/4bbfc5f4a7e64e4df13fa8661f10c28a543fe96c))
* **manager:** отвечать через последний канал клиента ([12fde6c](https://github.com/pksep/chat_client/commit/12fde6c5ae6f6238f55b9ffc05fc7042a170c2df))
* **manager:** показывать инициалы в списке менеджеров ([92c1068](https://github.com/pksep/chat_client/commit/92c10683d3613dcd28277c41331c495b22b7312c))
* **manager:** показывать ошибки клиентов через уведомления ([837ad37](https://github.com/pksep/chat_client/commit/837ad37c7e51ab14f5e1415549d2386c5e45a3fb))
* **manager:** сохранять раздел клиентов на мобильном ([f876595](https://github.com/pksep/chat_client/commit/f87659535afba976eaebdb64aa10a51437b20f84))
* **media:** invalidate repaired media caches ([b7c4478](https://github.com/pksep/chat_client/commit/b7c4478f0591aad90bb0e4d391e16942898a5d82))
* **media:** open cached PDF URLs in slider ([46fea0b](https://github.com/pksep/chat_client/commit/46fea0b849d707e1566339fdb5dad5c4d4294fb7))
* **menu:** unify list states, headings and search geometry ([4c09853](https://github.com/pksep/chat_client/commit/4c098530eaac29aac244221191fa95bec11a7229))
* **messages:** align single emoji footers and dark timestamps ([ae26115](https://github.com/pksep/chat_client/commit/ae2611597511687500d8b304c034de312e11a714))
* **messages:** download all attached files ([b48794e](https://github.com/pksep/chat_client/commit/b48794e33234ec1e2494981213c1fca55541da11))
* **messages:** extend highlights to both chat edges ([f430b1d](https://github.com/pksep/chat_client/commit/f430b1d6e27b3b98fab8a0de8a854ef2ce12ea5e))
* **mobile:** align chat and profile layouts ([b450d4b](https://github.com/pksep/chat_client/commit/b450d4bb626db75a9d090158b8ddc50b6c1bb8ae))
* **mobile:** align pinned messages below header ([9496a7f](https://github.com/pksep/chat_client/commit/9496a7f537f30726fcb7f8b657b2697e314febf6))
* **mobile:** hide hovered topic bottom border ([6eb8e30](https://github.com/pksep/chat_client/commit/6eb8e30c3582d3f0a6de9d62d7d4b8d631b57c3e))
* **mobile:** inset topic dividers evenly ([798038e](https://github.com/pksep/chat_client/commit/798038eae91111239273c29a721a4ff0b83d69e4))
* **mobile:** remove topic hover gap ([da40443](https://github.com/pksep/chat_client/commit/da40443d666b8707ff63f6c06a0201e21560d403))
* **mobile:** use black active navigation icons ([b366242](https://github.com/pksep/chat_client/commit/b36624290610d95b3ca2af5f869b953f34906c68))
* **modals:** animate the first mobile opening ([0e4f8ad](https://github.com/pksep/chat_client/commit/0e4f8adb991f560ce9ef4d1cdde27b422c0589de))
* multiupload ([29ba6f3](https://github.com/pksep/chat_client/commit/29ba6f36a6c013a9870c35c1f84a5c57697e150f))
* **navigation:** skip mobile section motion from nested pages ([1c86b58](https://github.com/pksep/chat_client/commit/1c86b58c1cea4c03aadabe9e49dbc620d730a7b3))
* **navigation:** stabilize call headers and Android back targets ([172d084](https://github.com/pksep/chat_client/commit/172d084c81ce0793b34fbc1c48da1be729c58df2))
* order pinned topic ([caf8e4e](https://github.com/pksep/chat_client/commit/caf8e4e3736715af6bdc0465b60296a865aba8a4))
* padding folders in mobile ([4fc4bff](https://github.com/pksep/chat_client/commit/4fc4bff7d29a81a570930cf707008daa345d1ea2))
* padding mobile folders ([fdf5352](https://github.com/pksep/chat_client/commit/fdf5352f5814e247d3542eb156454a60d3931501))
* preserve invite authorization when joining group calls ([5c1076f](https://github.com/pksep/chat_client/commit/5c1076f0df492dbf39a000952b2f3e8d63e3546c))
* **profile:** keep mobile panels independent of chat wallpapers ([6ba7a1a](https://github.com/pksep/chat_client/commit/6ba7a1a7f8a037cae492fe1cec71939a4533a968))
* scope chat wallpaper permission update ([ed497bf](https://github.com/pksep/chat_client/commit/ed497bfbdb674b05c4401d00a07dd6ffe7c93d08))
* **search:** preserve mobile chat layout during search ([7187177](https://github.com/pksep/chat_client/commit/7187177d6f16d1de56b3c7cd8693c521dedda05e))
* show theme control in native profile menu ([400c3b5](https://github.com/pksep/chat_client/commit/400c3b5dec43d091514f11639f5d6c94138f8957))
* silently hide unavailable chat sections ([6ad717d](https://github.com/pksep/chat_client/commit/6ad717d0e2d2f1c30600489c1c8f6f5133d1e6c9))
* stabilize Mastra stream lifecycle and persistence ([d69776d](https://github.com/pksep/chat_client/commit/d69776d838bdfd59e2e85cd7e2d52d9f65bf3ad8))
* **startup:** open cached chats when network requests stall ([ec9ca80](https://github.com/pksep/chat_client/commit/ec9ca802ec0901429b0f8194544723202cd4bdcc))
* style ([e183d14](https://github.com/pksep/chat_client/commit/e183d14816c7e011d18d96392b522b456bf97a69))
* style search ([9efcd78](https://github.com/pksep/chat_client/commit/9efcd78f3a27c8341129754ca013268b0a33cf16))
* styles ([5059999](https://github.com/pksep/chat_client/commit/50599990a8bf6047639ed7c8bb504fe7b6567b00))
* styles ([dd7f492](https://github.com/pksep/chat_client/commit/dd7f492a5a6bc94c81af4c8c533f73d371065894))
* suppress notifications handled on another device ([78c8975](https://github.com/pksep/chat_client/commit/78c8975f9eed430ebfd015183e27c2e602c16ab0))
* suppress notifications handled on another device ([e68c033](https://github.com/pksep/chat_client/commit/e68c033e95f26077ac2c1da4cfa29d8829f615d4))
* **theme:** correct component colors ([d326040](https://github.com/pksep/chat_client/commit/d326040a5e345d3e885dd4bd8897a58e5a0dd486))
* **topics:** preserve mobile context menu state ([65181dc](https://github.com/pksep/chat_client/commit/65181dc3368ed8f99f0f6df9390bde8b4fbc3a75))
* **ui:** preserve motion while disabling item color transitions ([6ec205d](https://github.com/pksep/chat_client/commit/6ec205dd9093ca3995748bf1ca519edf24f2b8c2))
* **ui:** use public yui 0.1.332 for editor and inputs ([02d7a70](https://github.com/pksep/chat_client/commit/02d7a705be0263ccc5cad4dba346cf25a0ab1774))
* use supported task status icons ([1702571](https://github.com/pksep/chat_client/commit/17025715100bc0743929915f5c28eafcb4e83ac1))
* user status api test and fix background sync ([11bec64](https://github.com/pksep/chat_client/commit/11bec64b633e7196ce3d30a8a8f6a8a5cf1d9b10))
* using vapid ([f763f41](https://github.com/pksep/chat_client/commit/f763f411036e8298181fded8d90a1cc842a45570))
* исправить завершение звонка и загрузку файлов ([52cc715](https://github.com/pksep/chat_client/commit/52cc715e5e72b0d7df6a867bb0eb1ea6ddb181a8))


### Features

* **access:** enforce permissions and adapt chat navigation ([a3903d2](https://github.com/pksep/chat_client/commit/a3903d27f9af28bf2841c59c0939e2334e822fe2))
* add folders ([18f08b5](https://github.com/pksep/chat_client/commit/18f08b581fc1612511720110f1d3ec3d69e306a7))
* add protected support folder for Smart Press clients ([6c6a6c5](https://github.com/pksep/chat_client/commit/6c6a6c54f24b51b855b1edbc2e5f08583f9f49ae))
* **android:** match launcher and startup branding to theme ([ac9e0a1](https://github.com/pksep/chat_client/commit/ac9e0a1b11f69079134d326997c8674cc30dd64e))
* connect tracer ([3d6d6d1](https://github.com/pksep/chat_client/commit/3d6d6d1eafcab4363720864ffe298b2c3f353470))
* **folders:** add wrapping folder navigation on mobile ([8b2723e](https://github.com/pksep/chat_client/commit/8b2723e49499f81de97c4d5ab610372a3c5f7ee0))
* **folders:** sync changes and reconnect snapshots via sockets ([8a46087](https://github.com/pksep/chat_client/commit/8a4608799248b462233de8a7b61f5282b9a1355c))
* gate AI and clients by personal access ([cf8af98](https://github.com/pksep/chat_client/commit/cf8af983a8112d3b140314bdba50bc2c0526fa12))
* optimize startup notifications and media ([29e5864](https://github.com/pksep/chat_client/commit/29e5864e1b369915f9f5ab45e057493660b49bbd))
* refine AI assistant layout and menu ([602d501](https://github.com/pksep/chat_client/commit/602d5012453907735e9e6e077120ba4e5c70a002))
* **theme:** smooth visible theme changes in 200ms ([f7cba30](https://github.com/pksep/chat_client/commit/f7cba30ad9df53e14aba207069a680cccf488707))
* update web version ([af46348](https://github.com/pksep/chat_client/commit/af4634847e56e0b24ed22c3d8d9a04a73d4a6848))
* update web version ([92da808](https://github.com/pksep/chat_client/commit/92da808f90fabf2a1cac397ce97c6ef7575af03a))
* update web version ([d099a77](https://github.com/pksep/chat_client/commit/d099a772df795fbed7ef339c3a871633219daf6b))
* update web version ([2bcf7cb](https://github.com/pksep/chat_client/commit/2bcf7cbc95723e5be79576e8efa9b1951920ef41))
* update web version ([14ee470](https://github.com/pksep/chat_client/commit/14ee4700697d37256185313fc2a0b6051a5e0c64))
* update web version ([ee67eb5](https://github.com/pksep/chat_client/commit/ee67eb5e2a4e5bb8c4a97314f461aba016b841a5))
* update web version ([60aa20a](https://github.com/pksep/chat_client/commit/60aa20a438f406c14b1fef0d256b68a0e1e4b162))
* upgrade folders ([3673563](https://github.com/pksep/chat_client/commit/3673563f2d0024a58f246581c2c4e4dc6f449d15))
* web version ([cf4c32b](https://github.com/pksep/chat_client/commit/cf4c32b1634d615c7b9b0b7473b1784555df6adf))

# [1.41.0](https://github.com/pksep/chat_client/compare/v1.40.0...v1.41.0) (2026-09-16)


### Bug Fixes

* **ai:** allow selecting and copying message steps ([09e13a8](https://github.com/pksep/chat_client/commit/09e13a8a2151d0b7a8bdb027e703a5485d4c1404))
* **ai:** keep action plan controls below the message ([ba34b9f](https://github.com/pksep/chat_client/commit/ba34b9f551c804fcf0db4fd5cc88809a8cd56ab2))
* **ai:** preserve mobile menu spacing after canary update ([0c0f8bc](https://github.com/pksep/chat_client/commit/0c0f8bc3b53ea5e82109165ad77994d761c86206))


### Features

* **ai:** show durable action progress and preserve chat drafts ([843a148](https://github.com/pksep/chat_client/commit/843a1481f5acacfe348c00486c84af045901ed63))

# [1.40.0](https://github.com/pksep/chat_client/compare/v1.39.0...v1.40.0) (2026-09-16)


### Bug Fixes

* calls with one person and styles ([f393ea3](https://github.com/pksep/chat_client/commit/f393ea38aafba0ba6d016e89cefdbf7d4d6e7126))
* improve mobile forward recipient modal ([e66f5e9](https://github.com/pksep/chat_client/commit/e66f5e9ea67d956e0e0d71bc50acf350cc856eec))
* lint ([98b746b](https://github.com/pksep/chat_client/commit/98b746b67e6e659965f41a803ca3738de2370d2f))
* **manager:** pin published YUI with client section components ([ab3f5ae](https://github.com/pksep/chat_client/commit/ab3f5ae794abbef44054fea1efa8f185a0e41e22))
* styles ([8bdea97](https://github.com/pksep/chat_client/commit/8bdea97a2507b94182fc77fffd509f0123a1d4c5))
* styles ([ef8e869](https://github.com/pksep/chat_client/commit/ef8e869844313ceb649937cdbf95aae9cc23b132))
* styles ([58b12c2](https://github.com/pksep/chat_client/commit/58b12c2dfb54cdfce461364a07d5a0ed2d3a634a))
* styles ([6503c1f](https://github.com/pksep/chat_client/commit/6503c1f982de08709cc91d3414ba48b90c6449f9))
* update yui emoji picker ([9bc04e7](https://github.com/pksep/chat_client/commit/9bc04e705895ad90a1e5ce21e5b197f1f1405c8b))


### Features

* authorize inquiry attachment downloads ([959f539](https://github.com/pksep/chat_client/commit/959f539903a058e1fa549b53427f1461c67fcb44))
* **manager:** add clients inbox and native ERP contact actions ([e8aec7c](https://github.com/pksep/chat_client/commit/e8aec7cde19d81619129808229e7016c94e5c83f))


### Performance Improvements

* optimize Android startup and topic navigation ([9bfe463](https://github.com/pksep/chat_client/commit/9bfe46308096534433c5f0ac8a39326580e801a0))

# [1.39.0](https://github.com/pksep/chat_client/compare/v1.38.0...v1.39.0) (2026-09-08)


### Bug Fixes

* **ai:** align collapsed item divider ([cafe3ce](https://github.com/pksep/chat_client/commit/cafe3ce971e4b50b2033e1f3ed67cfe632a633d9))
* **ai:** align date color with chat ([95a270d](https://github.com/pksep/chat_client/commit/95a270d6e6960bf8cfd85e8aeaa99f61e22a0ab7))
* **ai:** align message text metrics with chat ([d9bfe2e](https://github.com/pksep/chat_client/commit/d9bfe2e9a28c31da328c9741cd236c7ae3688446))
* **ai:** align reply styling with chat messages ([053f851](https://github.com/pksep/chat_client/commit/053f8513cf4ea9913cac8d096b7325c203173fdb))
* **ai:** align response and voice controls ([ec3cec1](https://github.com/pksep/chat_client/commit/ec3cec14fc7f0c24596fe8650856ce06588db3c8))
* **ai:** constrain menu separator width ([35c9f03](https://github.com/pksep/chat_client/commit/35c9f030a5e5c3862308b3c5358cbafce49b4122))
* **ai:** keep header menu above pinned content ([5d99e75](https://github.com/pksep/chat_client/commit/5d99e755de998d92d7ff189a70829ca077ef5b87))
* **ai:** keep response mode and send buttons 8px apart ([9b6e418](https://github.com/pksep/chat_client/commit/9b6e418ce1e330e338af2be98d873a85375370ab))
* **ai:** keep response selector width stable ([dab12c3](https://github.com/pksep/chat_client/commit/dab12c37bcfd1053ef3df2696a8c7c15f990ef1a))
* **ai:** keep search usable with pinned messages ([e0474fd](https://github.com/pksep/chat_client/commit/e0474fd4468ef988e00879e67bdeb0c87d3aca23))
* **ai:** make search result navigation continuous ([35e163e](https://github.com/pksep/chat_client/commit/35e163e943d3976b0743b41c04f30d30a32b8120))
* **ai:** move collapsed divider outside button ([066ba77](https://github.com/pksep/chat_client/commit/066ba779339af4a63468d801d375f96a46eb2019))
* **ai:** pass chat thread to Mastra memory ([b4d5990](https://github.com/pksep/chat_client/commit/b4d5990080768cdde5065bb4d94ad4725bd8d265))
* **ai:** preserve approvals and surface tool errors ([9f92639](https://github.com/pksep/chat_client/commit/9f926392f6b7997d90d26ba0d5156934a9eb6895))
* **ai:** preserve rounded pinned message accent ([7faf2cf](https://github.com/pksep/chat_client/commit/7faf2cfe55a14cad85cc54e79ea390d3beef9a7b))
* **ai:** sync collapsed avatar theme color ([fb5e01f](https://github.com/pksep/chat_client/commit/fb5e01f4273c5d45d0dbbb63b7c3ce71f1465f1a))
* **ai:** truncate long pinned message previews ([1cc8b8b](https://github.com/pksep/chat_client/commit/1cc8b8b83cb91157d260fcdd6710d69501863303))
* allow set styles in span ([7cc89eb](https://github.com/pksep/chat_client/commit/7cc89eb319048b73aec4f7b448959a68635695c7))
* apply lint formatting ([28939a2](https://github.com/pksep/chat_client/commit/28939a210b7cabba931b4ab216a2c660574306c8))
* **CHAT-286:** improve Android notification navigation and branding ([ed1b6c1](https://github.com/pksep/chat_client/commit/ed1b6c167694f1722851ddaff92da5f55f77fe61))
* emoji picker ([23ab014](https://github.com/pksep/chat_client/commit/23ab014a19d2572155eb7fdcc22dd7c0481c01ae))
* lint ([d5597fd](https://github.com/pksep/chat_client/commit/d5597fdc7a9992a25f49af39f52ce687205626c6))
* lint ([16d9e37](https://github.com/pksep/chat_client/commit/16d9e37dcae37af1d39ceaad5568b2c7c117a090))
* version ([acef60a](https://github.com/pksep/chat_client/commit/acef60afd2684139474f244b48b25ba3bbee65ef))


### Features

* **ai:** add generated attachments and finalize AI UI ([e075ed5](https://github.com/pksep/chat_client/commit/e075ed577fc51cd885233d8cb6400c9478f74ebd))
* **ai:** add pinned message navigation ([633aff8](https://github.com/pksep/chat_client/commit/633aff8ff2c348a2a8384cbf6398d5b759abc9a4))
* **ai:** add response model selector ([7242f8b](https://github.com/pksep/chat_client/commit/7242f8b28a348ec533f8f1dbc20e6ac29dd32927))
* **ai:** confirm standalone ERP entity creation ([597adaa](https://github.com/pksep/chat_client/commit/597adaa3db129615fcb5872b05726d468f3e3d18))
* **ai:** describe shipment approvals ([46ae174](https://github.com/pksep/chat_client/commit/46ae17467668ad80147577178f2c902478769682))
* update chat branding and Android compatibility ([8432c54](https://github.com/pksep/chat_client/commit/8432c54575de09d29939dfa89b5245411b9e20d1))
* update package json ([ea5f4cc](https://github.com/pksep/chat_client/commit/ea5f4cc99f84f418d2c7513ff0b04eb983188348))
* update web version ([a8ca7e5](https://github.com/pksep/chat_client/commit/a8ca7e54c4ae342df46d83b09a0870f99e746760))
* update web version ([8142337](https://github.com/pksep/chat_client/commit/814233735119feb5203fd208e3e3251780871c24))

# [1.38.0](https://github.com/pksep/chat_client/compare/v1.37.0...v1.38.0) (2026-09-02)


### Bug Fixes

* add sass embedded for scss build ([39f50a7](https://github.com/pksep/chat_client/commit/39f50a7cba6aa3e8aff18e2645a843528c495a37))
* adjust active audio stream during calls ([ab90aad](https://github.com/pksep/chat_client/commit/ab90aad5958f72a86c9b964f2f22d993d5216247))
* **ai-menu:** align activity status spacing ([559bf35](https://github.com/pksep/chat_client/commit/559bf3557b6666c27b682737c8167039b8ef5fbd))
* **ai:** align assistant editor payload type ([9c9d2f7](https://github.com/pksep/chat_client/commit/9c9d2f74447f3009058ca92675eacf93a2754db6))
* **ai:** create tasks in isolated sessions ([5c8265d](https://github.com/pksep/chat_client/commit/5c8265d68a2126797aae36ebc1881c2c1ec8612e))
* **ai:** enable assistant beta navigation ([74b9e38](https://github.com/pksep/chat_client/commit/74b9e380426837f7c0951925f1fdcaeabd7d68e4))
* **ai:** highlight the active assistant chat ([8b0ae16](https://github.com/pksep/chat_client/commit/8b0ae16d4d55cb19f69078ec18fcd76f861a5dac))
* **ai:** recover stale tool approvals ([ba992ef](https://github.com/pksep/chat_client/commit/ba992ef1e0b7e7f5e85dbf17121fab75cb5084eb))
* **ai:** require approval through chat controls ([9a515c8](https://github.com/pksep/chat_client/commit/9a515c8ff456804bc82d4acef440f2867480ecad))
* **ai:** route protected uploads through public API ([3e31eab](https://github.com/pksep/chat_client/commit/3e31eab23ca8be343fc255f12e3c19b73da58391))
* align call background grid ([4c65b33](https://github.com/pksep/chat_client/commit/4c65b33ab116416cea5f942c382a9027278ce434))
* align chat creation icon with design ([88b4a75](https://github.com/pksep/chat_client/commit/88b4a75ade313d11fdaf9c674bf1dddeea212669))
* align chat logo assets ([1bf9fb6](https://github.com/pksep/chat_client/commit/1bf9fb66797d8b4b9da6ff4d55b5e87a7f9eb793))
* align group modal and contact selectors ([8ac2c81](https://github.com/pksep/chat_client/commit/8ac2c81122eb433610457bab1dc392f5699af9fe))
* alternate profile attachment file colors ([d2a2c67](https://github.com/pksep/chat_client/commit/d2a2c678090946770e6868d54312f2bcd0fd1d35))
* alternate profile attachment file styles ([c5a13bb](https://github.com/pksep/chat_client/commit/c5a13bb6915d26975ed74e03435a86daf11d1215))
* apply lint formatting ([9186532](https://github.com/pksep/chat_client/commit/9186532372e876d8dafab6e99ee1d8231aa0ea99))
* apply lint formatting ([b212acc](https://github.com/pksep/chat_client/commit/b212acc2dbf0d0e79be2ff4842c4f4fe7b8c46f5))
* **attachments:** overlay emoji picker in modal ([2073845](https://github.com/pksep/chat_client/commit/2073845905e81b0c84749f0ecc85d020798ca47b))
* batch profile attachments without scroll jumps ([5b4fc8d](https://github.com/pksep/chat_client/commit/5b4fc8de1476493b51927cc9e6d11239775dcf45))
* **bots:** authorize gateway requests with bearer token ([4a07456](https://github.com/pksep/chat_client/commit/4a07456713d0bde6d4990983fd26329f9907ae23))
* cancel attachment long press while scrolling ([a1c630c](https://github.com/pksep/chat_client/commit/a1c630c84d6f82ad6cba30934d9160ef5e8dbdb9))
* change showed pinned message in scrolling ([706c738](https://github.com/pksep/chat_client/commit/706c7387abeb5ef8dab4a134772d72d753962403))
* chat-265 mobile call bot layout ([8cf5be3](https://github.com/pksep/chat_client/commit/8cf5be331576d728ed1e107cde80b754ed787ccb))
* **CHAT-277:** improve media handling and upload feedback ([9cadfa6](https://github.com/pksep/chat_client/commit/9cadfa62ae23a8f7e8bf3f4a2bbba617d85dd0c1))
* constrain mobile assistant editor layout ([0565c81](https://github.com/pksep/chat_client/commit/0565c81f5727e6ba1f4d55c46302e1f770f2a9a3))
* context menu ([9079821](https://github.com/pksep/chat_client/commit/9079821295155469e349a60ce6a39525a1b7559f))
* disable mobile bot text selection ([4b1fa83](https://github.com/pksep/chat_client/commit/4b1fa832caadaf251bbdc6d491aee7c59e23fa5c))
* humanize AI action approvals ([b1f735a](https://github.com/pksep/chat_client/commit/b1f735a60a723f0c2673913d4f1fc36035fcc1a3))
* improve active call continuity and navigation ([4129428](https://github.com/pksep/chat_client/commit/4129428c11bf295c7551a653adbc0c85c0b67e45))
* improve call reconnect and adaptive video ([24577af](https://github.com/pksep/chat_client/commit/24577afbeea40cecf237fa8f115d607f19082cd2))
* improve call recovery and network handling ([2b0343a](https://github.com/pksep/chat_client/commit/2b0343a8e73e2ee414fe68ae8d76fdb4a8ae79e1))
* keep bottom pinned when reactions change ([de5d57f](https://github.com/pksep/chat_client/commit/de5d57f8076037e9f14704d25ac4854d5b0b7083))
* keep calls active until hangup ([36ff17d](https://github.com/pksep/chat_client/commit/36ff17d301488946093012186919b1586d4b1086))
* keep message list pinned after layout growth ([055a5cd](https://github.com/pksep/chat_client/commit/055a5cddea043b9e75e5f1030cc3de1565bd52e1))
* keep mobile call actions above input ([9039ad1](https://github.com/pksep/chat_client/commit/9039ad1be081b0c7e87130bcddacf1ff10cbcaff))
* keep pinned messages aligned during calls ([41241ca](https://github.com/pksep/chat_client/commit/41241cac82b0dc08dc10cfa55543075f88994b87))
* lint ([6d21f99](https://github.com/pksep/chat_client/commit/6d21f991a57b16276d7974a05ed71598fb0c3d11))
* lint ([e450c6c](https://github.com/pksep/chat_client/commit/e450c6cd632a18152f41a88a639750e601e3b731))
* lint ([99a233e](https://github.com/pksep/chat_client/commit/99a233e2755d9b8661135a52c9311805298f3102))
* lint ([8e702d8](https://github.com/pksep/chat_client/commit/8e702d8cc4761f2246e441a55be629da4fb7bdd6))
* lint ([d7b36bc](https://github.com/pksep/chat_client/commit/d7b36bcafb5b9fd758096de34434c5b2bec2165e))
* map call topic input commands to actions ([334f046](https://github.com/pksep/chat_client/commit/334f0468aa6adb5cc97d09cadefcc4acafd57a4f))
* **media:** allow 600 MiB uploads and resume after reload ([68a3cfc](https://github.com/pksep/chat_client/commit/68a3cfcb37c3fc04f6bdb9670b32f093f8f2e44a))
* **media:** reliably resume multipart uploads after refresh ([24d9bcf](https://github.com/pksep/chat_client/commit/24d9bcf08a8778d340ce4989def85f3e1ec7c331))
* merge ([560980d](https://github.com/pksep/chat_client/commit/560980d363c3d83f7eef3a64d8d0d07c7a69db16))
* messages group ([b88be02](https://github.com/pksep/chat_client/commit/b88be02b869ee7a59b88e3253b7a9d707aeb3d0b))
* normalize outgoing read receipts ([6c7c2e8](https://github.com/pksep/chat_client/commit/6c7c2e8c123d98f874e3d38ec75e3c2c3924c68c))
* open PDF in media slider ([6cafea1](https://github.com/pksep/chat_client/commit/6cafea1d1b91129e5ae2beceef396e23624d6e3f))
* optimize ([5815ea1](https://github.com/pksep/chat_client/commit/5815ea115cb32dc24877551381da5e6859f7c6e7))
* polish call recording controls ([a915c0f](https://github.com/pksep/chat_client/commit/a915c0f56bda25d631a026155aaf7bfaf48c8e0d))
* polish mobile call bot layout ([f153f77](https://github.com/pksep/chat_client/commit/f153f77a56168f3e156ecaff05d21470ced24090))
* prefer cached profile attachment history ([886c6f3](https://github.com/pksep/chat_client/commit/886c6f30c700360253e89c0af75b9fc9c01d8783))
* preserve forwarded message order ([c56c440](https://github.com/pksep/chat_client/commit/c56c4405228a512e8f328e72573429c073c4aad4))
* preserve notification message context ([e834432](https://github.com/pksep/chat_client/commit/e83443212b91276e73baf897d80bd96060329180))
* preserve screen share quality during recovery ([65e23e0](https://github.com/pksep/chat_client/commit/65e23e07536e3a27518cefc238c771502ec0e687))
* preserve topic preview after message deletion ([b5b01ec](https://github.com/pksep/chat_client/commit/b5b01ec9b5fd7e668bfe8aa2cd0a5b2f62fa75f5))
* prevent stale chat messages on topic switch ([c8bd19c](https://github.com/pksep/chat_client/commit/c8bd19c0da3bb88a5ee66a2a291d58e8eb0a1ff2))
* remove mobile call route transition ([a73d9f7](https://github.com/pksep/chat_client/commit/a73d9f7a119e4e74f1cfeea2321a760ed8c3acf2))
* restore sender-based attachment colors ([47514c9](https://github.com/pksep/chat_client/commit/47514c9c87539cbee3e91e8321bc0cf0b9e3cc91))
* save bot commands ([a221e3c](https://github.com/pksep/chat_client/commit/a221e3c715d602a0933059cfc9b6f89bd27ac7c6))
* scroll and add saved messages ([5036161](https://github.com/pksep/chat_client/commit/5036161548d3bd7c68aab0aa3eee04cff94c0cf3))
* scrolling ([3b8ae35](https://github.com/pksep/chat_client/commit/3b8ae3594d9eb22caded57254eff47038c09d6e1))
* **security:** sanitize rendered message html ([546cf82](https://github.com/pksep/chat_client/commit/546cf8281d44fb057ae66cf8bb97f1e990ea6a19))
* send forwarded message with typed text ([aa7eef3](https://github.com/pksep/chat_client/commit/aa7eef3be825bb8f1cd8dffaf7d9b5b273ffa161))
* show all PDF pages in chat ([b5b7a4d](https://github.com/pksep/chat_client/commit/b5b7a4d047b87c205f64fd1489d0ca54787c991e))
* show bot links and fix styles ([567a900](https://github.com/pksep/chat_client/commit/567a900ee27daceaa904a0fc7fca10ede836fe49))
* show call prompt placeholder when disabled ([a46dd72](https://github.com/pksep/chat_client/commit/a46dd72e78df13ab2323b9276ab6314e11aa1e18))
* size bot icon ([3326668](https://github.com/pksep/chat_client/commit/3326668b45199ccf4d29a718aa124f59ae9b86e8))
* stabilize network status label ([ccd9651](https://github.com/pksep/chat_client/commit/ccd9651d6965c32f57b77b5baff6147730af05dd))
* start ([cf16961](https://github.com/pksep/chat_client/commit/cf169612614f9afce49595976923f196c9ba02ef))
* style ([c1928cd](https://github.com/pksep/chat_client/commit/c1928cdd686da143fa0cf78d98784b9f98661cb9))
* styles ([38abb0f](https://github.com/pksep/chat_client/commit/38abb0fd08f5c2e6caf56a28973ee338f000dcba))
* styles ([d047b66](https://github.com/pksep/chat_client/commit/d047b66000dae3a1c4d2965a597f57bc7a13ab9d))
* styles ([76962b2](https://github.com/pksep/chat_client/commit/76962b27f8862eb347526f7cfbfab8ebbf85af75))
* styles ([72fe258](https://github.com/pksep/chat_client/commit/72fe258212f2618b1ab0f54f5324fbbacf739d03))
* support call topic AI responses ([7a4595f](https://github.com/pksep/chat_client/commit/7a4595fda6c06c571fe11c342dd2fbeb1c000bb7))
* sync and scroll ([6e902c4](https://github.com/pksep/chat_client/commit/6e902c4b478009bb67ee18cf0ccae96c325aee76))
* sync topic preview message status ([36f83b6](https://github.com/pksep/chat_client/commit/36f83b603b2b5981258f9694cd5765fa5c300bb0))
* sync topic preview with client messages ([0e55653](https://github.com/pksep/chat_client/commit/0e55653df074b698285f0e491eb10998bada6c99))
* **ui:** improve avatar fallbacks and AI panel states ([7a7c7c3](https://github.com/pksep/chat_client/commit/7a7c7c34ca84284ca5cadfece42943619a7526bc))
* use mobile group avatar cropper layout ([73e8b12](https://github.com/pksep/chat_client/commit/73e8b1257f302c862e79d250b6efbb8c10d704a2))
* VITE_BOT_GATEWAY_URL ([15b5d22](https://github.com/pksep/chat_client/commit/15b5d229794660a96d26f6ea81177d63ee321f0e))
* web update ([da51b1e](https://github.com/pksep/chat_client/commit/da51b1eda80125498d639c3e01049f896abdd54d))


### Features

* add AI assistant mock interface ([dfd960b](https://github.com/pksep/chat_client/commit/dfd960b90cae96aafea33931c4ee9c87658c1012))
* add call recording transcripts ([502157d](https://github.com/pksep/chat_client/commit/502157dcc8101ce6c800cf7d25693286f13cd33c))
* add favorite history clearing ([4bd636c](https://github.com/pksep/chat_client/commit/4bd636c10fd056cc56fa1c654b5882341aedacaf))
* add profile attachments browser ([ba38015](https://github.com/pksep/chat_client/commit/ba38015ea90ea6d4c500db4f97dc56aee60f0b1a))
* add resumable multipart file uploads ([c50412b](https://github.com/pksep/chat_client/commit/c50412bbe8fa076c92e2d0dcebffe15f1869df7a))
* add RuStore push with Firebase fallback ([54b3ee2](https://github.com/pksep/chat_client/commit/54b3ee2339c1fe33d7b5c67ceaf9e61ddd6c0035))
* **ai:** add message context actions ([7b25b2e](https://github.com/pksep/chat_client/commit/7b25b2e8987dd5855331f968d190f19d35d5bd41))
* **ai:** connect assistant interface to Mastra ([9b0b00c](https://github.com/pksep/chat_client/commit/9b0b00cfd20685b23c3e0156d3554e4e9b3a59e1))
* **ai:** connect automatic approval mode ([bef047d](https://github.com/pksep/chat_client/commit/bef047da85c8d156c0700bb5a5356c02c14f9145))
* **ai:** describe detail archive approvals ([1ce5372](https://github.com/pksep/chat_client/commit/1ce5372434f035035cbd7090070307b07d6ffd54))
* **ai:** describe ERP approvals in plain language ([42debd5](https://github.com/pksep/chat_client/commit/42debd5e488416aaa0c60adcf21b85b962ec73b6))
* **ai:** describe ERP specification approvals ([64611ae](https://github.com/pksep/chat_client/commit/64611ae538b976de61e33e593703325b40c25b5e))
* **ai:** humanize ERP detail approvals ([932b1f7](https://github.com/pksep/chat_client/commit/932b1f79f77494078e2b097eb82d5a8dd353d13d))
* **ai:** humanize knowledge base approvals ([3830046](https://github.com/pksep/chat_client/commit/38300468fda5c799de7e0d55cf5e962f4678b83e))
* **ai:** improve assistant chat experience ([08b1769](https://github.com/pksep/chat_client/commit/08b176930b0a8e53a79925f3c7ae6b2cad0020af))
* **ai:** show and manage recurring automations ([714b7ce](https://github.com/pksep/chat_client/commit/714b7cef8a10b6c41a23708ffefa68f5b2fb3980))
* **ai:** transfer chat attachments to ERP ([12b5131](https://github.com/pksep/chat_client/commit/12b5131306510c15264779790f348bc9e327df73))
* **CHAT-282:** display deleted ERP accounts ([2c8c19b](https://github.com/pksep/chat_client/commit/2c8c19b606f0632e29e65c7417d65bb5b22b6a70))
* connect AI chat to approved Board actions ([7cb8ed9](https://github.com/pksep/chat_client/commit/7cb8ed99ef7a3f5f6fe1f18aa9cade97d13c09b6))
* fix Audio volume ([6461e69](https://github.com/pksep/chat_client/commit/6461e69c4a3df41f0c84f26d357d50b239dade61))
* humanize all board approvals ([b7ad611](https://github.com/pksep/chat_client/commit/b7ad611a5d5e549dd9aea34f9b70691294cfc7d4))
* paginate topic attachments by type ([2e211bd](https://github.com/pksep/chat_client/commit/2e211bdda131efa0ad2ef92e425b4fb8649cb1f8))
* restore reactions ([b3f122e](https://github.com/pksep/chat_client/commit/b3f122e53ac9d952242137021bd38fff12b879ce))
* scroll and skeleton ([ff1161e](https://github.com/pksep/chat_client/commit/ff1161e7cdea886dcdf6b655873217abb389ad8e))
* update Mastra client integration ([f6fc1c8](https://github.com/pksep/chat_client/commit/f6fc1c84adf380c147b6427426c80bead6c8c20b))
* update web version ([63bebcf](https://github.com/pksep/chat_client/commit/63bebcf6e25ed1acb4a8dac085ae70565547dccf))
* web update ([8dbaab4](https://github.com/pksep/chat_client/commit/8dbaab4c1f02599e546e91f2155a657eddf80c4e))


### Performance Improvements

* lazy-load calls and AI features ([509c1d9](https://github.com/pksep/chat_client/commit/509c1d9cd38047f4301062df783bd9b2f24a4096))


### Reverts

* restore sender-based attachment colors ([f5a8904](https://github.com/pksep/chat_client/commit/f5a890453680c0b6639b4d3634c6dfe94cd2edec))

# [1.37.0](https://github.com/pksep/chat_client/compare/v1.36.2...v1.37.0) (2026-07-13)


### Bug Fixes

* show beta version ([64e7e65](https://github.com/pksep/chat_client/commit/64e7e65f77af271fa0bbee88fb16c70ffe9eb361))


### Features

* update web version ([60d96ce](https://github.com/pksep/chat_client/commit/60d96cebcb0f7e035da8b8fe8fbec4e6c6e17de4))

## [1.36.2](https://github.com/pksep/chat_client/compare/v1.36.1...v1.36.2) (2026-07-13)


### Bug Fixes

* update web ([c52528a](https://github.com/pksep/chat_client/commit/c52528aebc19a05a42d9be6921aad6a55aaa3cef))

## [1.36.1](https://github.com/pksep/chat_client/compare/v1.36.0...v1.36.1) (2026-07-13)


### Bug Fixes

* build gralde ([328d811](https://github.com/pksep/chat_client/commit/328d811f518c0a9553ad757af1b55f83313f383b))
* deleting bot ([1087e20](https://github.com/pksep/chat_client/commit/1087e20ba21092a841877a9883ae8a629d131aca))
* online status ([69228bc](https://github.com/pksep/chat_client/commit/69228bc889d634f776d81105ed23071548319d26))
* scroll behavior ([310d7f8](https://github.com/pksep/chat_client/commit/310d7f8acc91b82c243db6de31caaec0b207c4d3))
* scroll position, shadow sync, badge count ([00bde8a](https://github.com/pksep/chat_client/commit/00bde8a0097133bce0b33e9a004bb1fa2e04f7e9))

# [1.36.0](https://github.com/pksep/chat_client/compare/v1.35.2...v1.36.0) (2026-07-08)


### Bug Fixes

* size video and image ([4b2bc33](https://github.com/pksep/chat_client/commit/4b2bc33541eefe7af087f7eb5b9310cc46487e0f))
* style forward button ([4d5641b](https://github.com/pksep/chat_client/commit/4d5641b5405609d0bf3baa6e5d0d37ab69795342))


### Features

* web version ([be3acc6](https://github.com/pksep/chat_client/commit/be3acc66dfbb236d9678cc2b945071c2b98c9709))

## [1.35.2](https://github.com/pksep/chat_client/compare/v1.35.1...v1.35.2) (2026-07-07)


### Bug Fixes

* autoopening call modal ([fb607c3](https://github.com/pksep/chat_client/commit/fb607c383d1f003404e8bbd4b94e49b38590de02))
* forward message ([3e65a88](https://github.com/pksep/chat_client/commit/3e65a888171642e279653e719be04f3ce444a7b6))
* reconnect vpn ([6acb7db](https://github.com/pksep/chat_client/commit/6acb7db559c50adddf39c872120a17c8a4da2e1d))
* send message after change vpn ([6056106](https://github.com/pksep/chat_client/commit/60561069473122bea8be7b938d9a1bb8c69708b9))
* volume keys in mobile calls ([a8cef42](https://github.com/pksep/chat_client/commit/a8cef42219c2bea39a095d75ac7055c051357a40))
* web update ([5e76a13](https://github.com/pksep/chat_client/commit/5e76a13c53d9338e9bf4462b17b136e7cccfbf1b))

## [1.35.1](https://github.com/pksep/chat_client/compare/v1.35.0...v1.35.1) (2026-07-06)


### Bug Fixes

* hotfix auth ([a1b3d52](https://github.com/pksep/chat_client/commit/a1b3d52c6e21ad7efaf46b958c6a932d38d21b70))

# [1.35.0](https://github.com/pksep/chat_client/compare/v1.34.0...v1.35.0) (2026-07-06)


### Bug Fixes

* hotfix recursion ([d49034b](https://github.com/pksep/chat_client/commit/d49034b4e80bfef6d35fc8fc83b0975eeecc3574))


### Features

* web update ([e61133b](https://github.com/pksep/chat_client/commit/e61133bfea9169b2b6d271e7d8dfd321e361a9d2))

# [1.34.0](https://github.com/pksep/chat_client/compare/v1.33.0...v1.34.0) (2026-07-03)


### Bug Fixes

* lint ([18d88d9](https://github.com/pksep/chat_client/commit/18d88d9dcab4951ea4e99e0f5228e1268ec1090b))
* lint ([bc831b5](https://github.com/pksep/chat_client/commit/bc831b549408a36af973b5fbfcdd4a39a87e8acd))
* network recovery and screen share state ([fb55622](https://github.com/pksep/chat_client/commit/fb556223f2a83bba768300710755050a6988cb78))
* skeleton and search ([184d610](https://github.com/pksep/chat_client/commit/184d6108046d707e323d856692313280ad5ae508))


### Features

* update web version ([452c7d4](https://github.com/pksep/chat_client/commit/452c7d439b15de77e7be70f845ae4fead905494f))
* upgrade speed in mobile ([be69b3b](https://github.com/pksep/chat_client/commit/be69b3b37dc627ee3704f7c66cedee1a4438c844))

# [1.33.0](https://github.com/pksep/chat_client/compare/v1.32.0...v1.33.0) (2026-07-01)


### Bug Fixes

* lint ([a86e7e4](https://github.com/pksep/chat_client/commit/a86e7e40c162dfb3f6139ae1b62b4c787318de33))
* reduce chat startup and media asset load ([ce980b0](https://github.com/pksep/chat_client/commit/ce980b0b6c0984cb0af3703ecdd24869de91848a))


### Features

* web update ([2753026](https://github.com/pksep/chat_client/commit/275302687f0aa12837eaa845445a91e7002e465c))

# [1.32.0](https://github.com/pksep/chat_client/compare/v1.31.0...v1.32.0) (2026-07-01)


### Bug Fixes

* adding bot ([e29ae57](https://github.com/pksep/chat_client/commit/e29ae573a49565f52b9cfea45b3a2014e8951463))
* apply chat-180 working changes ([045682c](https://github.com/pksep/chat_client/commit/045682c56cd6421835b499cea2ae5d23412f57ef))
* autorization page ([783848d](https://github.com/pksep/chat_client/commit/783848d1de3d2c91f9d5a78c5184479ab55c98d1))
* back event for slider ([f97808f](https://github.com/pksep/chat_client/commit/f97808f650a7ac0475c8eb3e8c39f6db2dfe405f))
* calls and drag img ([6ef65bf](https://github.com/pksep/chat_client/commit/6ef65bfa4cad97d5f6540f5670d5a89f2e607b9a))
* calls with bluetooth device ([c8a01d2](https://github.com/pksep/chat_client/commit/c8a01d22265738f51c77878d9709f3bb26029806))
* capasitor plugins ([d7402be](https://github.com/pksep/chat_client/commit/d7402be6cb800dd11ca99ffc84ef3d7e56942083))
* check is slider content ([a451ee1](https://github.com/pksep/chat_client/commit/a451ee1bfe9d3acb7844884f681d0e3e2006bd15))
* delete unused request ([d0d6260](https://github.com/pksep/chat_client/commit/d0d62608313c60f738a28afbb5aaf6cec1a429eb))
* design call tiles ([661c416](https://github.com/pksep/chat_client/commit/661c4168f5ba208e5295a4da28bf4138ba61775b))
* dropzone for tauri ([cf1510e](https://github.com/pksep/chat_client/commit/cf1510ef7444c5e3a7b9f65e8585b39a67070ef4))
* event ReactionSeen and design ([7a08dfd](https://github.com/pksep/chat_client/commit/7a08dfdac390a7ea4bbb210f43443de9fd448256))
* includeRoomState in calls ([6007150](https://github.com/pksep/chat_client/commit/6007150ff8beab9fb329b297a8b247443f2874fe))
* lint ([c1ab47d](https://github.com/pksep/chat_client/commit/c1ab47da9c2fdd38902990685017d3965e075625))
* lint ([8a4a3cf](https://github.com/pksep/chat_client/commit/8a4a3cfde4e9f053deec30efd0eb59b8725af5c9))
* lint ([1bd4a83](https://github.com/pksep/chat_client/commit/1bd4a83e7398c2f52ea742b11ca04c0970f026f8))
* lint ([bbfa7a4](https://github.com/pksep/chat_client/commit/bbfa7a4d8f2c6844b641c9de870a2341fa9b3055))
* lint ([9824eed](https://github.com/pksep/chat_client/commit/9824eedbd5f4fdb442b6a458b0608efae01beee5))
* lint ([26e3dfb](https://github.com/pksep/chat_client/commit/26e3dfb6a87dcb2613416974e69ad6bd79505bff))
* lint ([f2421bb](https://github.com/pksep/chat_client/commit/f2421bb0412e9957ca1e3c980f977b48b62f9d4f))
* lint ([0560d77](https://github.com/pksep/chat_client/commit/0560d7796c726e939d417345c32cc687335fd14c))
* lint ([1767ef8](https://github.com/pksep/chat_client/commit/1767ef8879e027d75982cc8a40e03f31b2bf1d89))
* lint ([e5ec0d7](https://github.com/pksep/chat_client/commit/e5ec0d76ec800dd383472712a06d79de50fb1fe2))
* lint ([d935381](https://github.com/pksep/chat_client/commit/d935381c97212186d160ec9d0bed7f670e86a25d))
* lint ([0fe5169](https://github.com/pksep/chat_client/commit/0fe5169cdd1fa4b16b20492bc50f5f43a1ffd005))
* lint ([5aef9ba](https://github.com/pksep/chat_client/commit/5aef9ba0c99ddce4be97119a2f87e6bfc7d2e151))
* opening and downloading files in mobile ([54bd073](https://github.com/pksep/chat_client/commit/54bd07384b4c92eec8f9f3431200c3a76e588605))
* pngs colortype ([1181947](https://github.com/pksep/chat_client/commit/11819476a638c08a293446c17ce6a7bf043478eb))
* problem send retry ([d234ca3](https://github.com/pksep/chat_client/commit/d234ca30b008abc59c606033668fc77b23b51307))
* reaction state ([517f706](https://github.com/pksep/chat_client/commit/517f706f1a0c076dbdc2de81b5998908797f8473))
* reconnect calls ([76470a0](https://github.com/pksep/chat_client/commit/76470a06b3d1cd05ef4e45e0bbeac34a9b20b72b))
* search and add enter and shift enter ([3acc65c](https://github.com/pksep/chat_client/commit/3acc65c77a28b2cf0a2c2ed8329651cd76fa37de))
* send media loding and without convert ([f12436c](https://github.com/pksep/chat_client/commit/f12436ccc4359df8ce44ed10c271ae0a97efbeff))
* silent sync pts ([0202cbe](https://github.com/pksep/chat_client/commit/0202cbebba0cf86d76fd449d7d7f11870d86b2b6))
* start and end joined call ([e0f23d3](https://github.com/pksep/chat_client/commit/e0f23d31eb0ad606f809ca34450d51e28471045e))
* styles and lint ([1988aa8](https://github.com/pksep/chat_client/commit/1988aa851cae301d714625ef4fe88d670cc89b5f))
* text ([d912b00](https://github.com/pksep/chat_client/commit/d912b0033841ca65d1d0d31f66bb461dac3fbb9c))


### Features

* add bot command list ([58282bc](https://github.com/pksep/chat_client/commit/58282bcba5a7d2e73cd3cfb35e2c55ed48cd83c6))
* add echoCancellation and another AudioCaptureOptions ([28f7f21](https://github.com/pksep/chat_client/commit/28f7f2118fb3f8f6b203eb35a208a0a3748eb975))
* add floating date ([3777d72](https://github.com/pksep/chat_client/commit/3777d72b59a6ea3561ebb15264149fe201fccf8e))
* add image-attachment-editor ([4096b85](https://github.com/pksep/chat_client/commit/4096b85028a657c27dde06ddb2cf6b189feae106))
* add in calls audiolevel and network status ([0e6b3c3](https://github.com/pksep/chat_client/commit/0e6b3c3733f0585bb6a4233bf51e5a11b9a92ef3))
* add in profile checking version and loading isBootstrapping ([947ae2d](https://github.com/pksep/chat_client/commit/947ae2de231a27d005ac0fc30dac95b103bd0af1))
* add mark as read and mark as unread ([34dc76a](https://github.com/pksep/chat_client/commit/34dc76ad4b4c5dc6eaa66800735e73c2d632a3c4))
* add microfon audio level ([75bfb2e](https://github.com/pksep/chat_client/commit/75bfb2e959b8ce8a7d40475837cef68416189d8a))
* add modal for vpn alert ([566377d](https://github.com/pksep/chat_client/commit/566377daaea71e21e99366051046700cce73b8be))
* add notification for yandex brawser ([a0816d6](https://github.com/pksep/chat_client/commit/a0816d6e8b96c3fda2eed2f1e32c6edbb1c2233f))
* add percent when update android apk ([1ba0505](https://github.com/pksep/chat_client/commit/1ba0505e7dbcc661d497919767538065a7ea84c8))
* add quote and reply ([953efb1](https://github.com/pksep/chat_client/commit/953efb1abd294d544b35264529ac55d2caf10853))
* add screen sharing and fix styles ([6a3616a](https://github.com/pksep/chat_client/commit/6a3616a1219ec2e71e0007c812311f44e45225f5))
* add search ([b51f65f](https://github.com/pksep/chat_client/commit/b51f65f42952a5b5bac439ae2cd43ecfcb843a6a))
* add telemetry ([ab00204](https://github.com/pksep/chat_client/commit/ab002047c5d8059e1eb3d0e4fa461ffc929ec4ec))
* add web version ([58918fa](https://github.com/pksep/chat_client/commit/58918fa723053307c9b2ab5be80661e0deb50897))
* client audit ([567be83](https://github.com/pksep/chat_client/commit/567be8348a430e4544ca3f3904fc1c9fca1d1239))
* design group info ([ff20944](https://github.com/pksep/chat_client/commit/ff209445a060e591b1bebb255a5d87f5303e14ba))
* finish design bot ([9279827](https://github.com/pksep/chat_client/commit/92798279ee34db8d1f304dafdfa75080af1a8d24))
* new release 1.6.0 ([85cfb38](https://github.com/pksep/chat_client/commit/85cfb380a0be844f72e075545912c459b3ca4bef))
* New Release v1.6.1 ([03f795b](https://github.com/pksep/chat_client/commit/03f795b6ab17414f9828009c4d8fcc985ebee9ae))
* release new version 1.6.2 ([1d82d44](https://github.com/pksep/chat_client/commit/1d82d445ad265c4db2b54ce8acba4c819c5bdc60))
* short organization link ([d90e6ff](https://github.com/pksep/chat_client/commit/d90e6ff20905c51d1408d8ba4f5c350e1ec637a5))
* show icon about reacted ([ee3af23](https://github.com/pksep/chat_client/commit/ee3af23d58d6ffeede34a003ad6c55d8ba86f4b9))
* start design adding bot ([253ab66](https://github.com/pksep/chat_client/commit/253ab66709586301c146c1767f53297e7a17852b))
* update pksep yui ([ef9ada6](https://github.com/pksep/chat_client/commit/ef9ada66a50b4453a152fd86801d923129796ea4))
* update version ([f65efd5](https://github.com/pksep/chat_client/commit/f65efd5b45eea0d21756cfb1977a3884d9b09cda))
* update web ([6197a6a](https://github.com/pksep/chat_client/commit/6197a6a2afc76d935b6dca1a07f6e8edc196b01d))
* update web version ([6b1e89f](https://github.com/pksep/chat_client/commit/6b1e89f52ad8fcd350e9f1b2587a3022188d9bd6))
* update web version ([fe22d37](https://github.com/pksep/chat_client/commit/fe22d37259b7404ee6364c9e296c5982fc720d7b))

# [1.31.0](https://github.com/pksep/chat_client/compare/v1.30.0...v1.31.0) (2026-06-04)


### Bug Fixes

* backgraund quality ([cfb820d](https://github.com/pksep/chat_client/commit/cfb820d31c22913ec8a0e02ac0371a1a7ab05063))
* badge ([c22a1d1](https://github.com/pksep/chat_client/commit/c22a1d164d4ceae79b4295d2054cf8f6a5f9ebea))
* lint ([3cab03b](https://github.com/pksep/chat_client/commit/3cab03b29fd1bda816243ebf4c7844615418babd))


### Features

* add tauri ([10b9442](https://github.com/pksep/chat_client/commit/10b9442b51b5e49502594dd9ab2467ce6326a5ca))

# [1.30.0](https://github.com/pksep/chat_client/compare/v1.29.0...v1.30.0) (2026-06-03)


### Bug Fixes

* notification click, open chat in self, not new window ([34358b5](https://github.com/pksep/chat_client/commit/34358b5d4bbf49f2ffc4540fabc86866a1947fcc))
* styles ([62eb132](https://github.com/pksep/chat_client/commit/62eb1326230518ea7b0653c350d6c179a9b2cca0))


### Features

* add ios install PWA info ([e7a4afc](https://github.com/pksep/chat_client/commit/e7a4afc1d4e2ba3283277a87ce3137bf427f6681))
* update call background logic ([180067b](https://github.com/pksep/chat_client/commit/180067b23e042c53a000b3f0d5e9b58b53dee4ce))

# [1.29.0](https://github.com/pksep/chat_client/compare/v1.28.0...v1.29.0) (2026-06-01)


### Features

* new release ([cc64141](https://github.com/pksep/chat_client/commit/cc641414a861663b9ea708b5fde7c9e364161997))

# [1.28.0](https://github.com/pksep/chat_client/compare/v1.27.0...v1.28.0) (2026-06-01)


### Bug Fixes

* add and showing emojies ([efb05cb](https://github.com/pksep/chat_client/commit/efb05cbc9aa5ffbd482a18f6c6e3c7f8f7f50ea9))
* and android call screen, and when answered call in another device, close voip ([f71e1bf](https://github.com/pksep/chat_client/commit/f71e1bf8dac0ab813d3346c5f9f5b62a8c4fdf78))
* avatars in selecting mentors ([7bd460f](https://github.com/pksep/chat_client/commit/7bd460f1edb18f9faa4354e6705781b5b966a0d8))
* calls ([c56c4d8](https://github.com/pksep/chat_client/commit/c56c4d85b5dcc80f81bece6857f3ca1220870713))
* change selected-messages-content style ([fe4f856](https://github.com/pksep/chat_client/commit/fe4f8568a9a966e4f0266fed852277f035a6ce4c))
* check users after ending call ([7573516](https://github.com/pksep/chat_client/commit/7573516480d363f39a796a025432c414fef9b73a))
* close profile modal after call ([8a03614](https://github.com/pksep/chat_client/commit/8a0361439d1afda86c7b14d82a6730913d67a521))
* delete unused script ([4a6fe6b](https://github.com/pksep/chat_client/commit/4a6fe6b199537bd61c58a725074f33e21e5dc1b0))
* dialing and show screen sharing ([0091164](https://github.com/pksep/chat_client/commit/00911640d67a5a7da22ea31c3bcac51ee672dc2a))
* dont open new window for call links ([99969f4](https://github.com/pksep/chat_client/commit/99969f44248efe1cb7426ceba22a6a24d9922321))
* downloading file ([04f92d0](https://github.com/pksep/chat_client/commit/04f92d01437f38be268f1cd8462d26a9f8645e38))
* end call ([bf39442](https://github.com/pksep/chat_client/commit/bf39442ab259e34406e798a456113ee1737f2c61))
* end call ([2a08ebe](https://github.com/pksep/chat_client/commit/2a08ebe67f7a36b6e665c34b9587c18ec3ec6618))
* ending call logic ([1baf112](https://github.com/pksep/chat_client/commit/1baf1124dd4a8711cb53474995b4054b1a349881))
* filtering messages ([6c583bc](https://github.com/pksep/chat_client/commit/6c583bca302d11ccf683d880202611a902e559ae))
* get right topic for sending file ([1cf0050](https://github.com/pksep/chat_client/commit/1cf005072189bb0e77b945dcfabbe1f373ba2922))
* getting token logic ([5285ffe](https://github.com/pksep/chat_client/commit/5285ffece82a2d0ead0fe13dac3410c99dc801ab))
* have update banner ([cbb6972](https://github.com/pksep/chat_client/commit/cbb6972daf0e477e16c69c318d3fa4bcb0cf93b6))
* hide read icon if message is system ([bd05bf1](https://github.com/pksep/chat_client/commit/bd05bf11f05603969366e37dad1ef375fe94b20a))
* line-height ([9c6adc7](https://github.com/pksep/chat_client/commit/9c6adc769dc81a5085a3328bdba1b442882b69f5))
* lint ([ab0a6a2](https://github.com/pksep/chat_client/commit/ab0a6a2e8711f0b517914824ee8280f343040a41))
* lint ([1807d25](https://github.com/pksep/chat_client/commit/1807d25a94b02d7a0211fc7a6024cf44c07caf84))
* lint ([71615df](https://github.com/pksep/chat_client/commit/71615dfef920aa4d06b50c41507801a4cfc54ca9))
* lint ([7d3d8cb](https://github.com/pksep/chat_client/commit/7d3d8cb909a2a3ba21500e1fb3ba12561e4cc978))
* lint ([e90d78b](https://github.com/pksep/chat_client/commit/e90d78bf49e3377988b674c0c7c90dcb3796da93))
* lint ([b95fc5c](https://github.com/pksep/chat_client/commit/b95fc5c8f146cfd72c67ca4d1789741a3ae9b47c))
* lint ([59fa362](https://github.com/pksep/chat_client/commit/59fa362686c66f916c1bcab908afd0fb18e6dd78))
* lint ([ae3e9fd](https://github.com/pksep/chat_client/commit/ae3e9fd1a0dcbc9b8e33aa0fb3c06af13767916d))
* lint ([6c34ce5](https://github.com/pksep/chat_client/commit/6c34ce5b77a124aedff75138c77fc2d721fcc9f2))
* lint ([908ddcb](https://github.com/pksep/chat_client/commit/908ddcb435bc62cbe18c4b483d360fdb7ccebd1e))
* lint ([e767c37](https://github.com/pksep/chat_client/commit/e767c37126f540bd9ab59e0e0ffde4eb942f4852))
* lint ([de708f7](https://github.com/pksep/chat_client/commit/de708f7f722069f18366284cfc23a0ff07a314e3))
* lint ([446dedc](https://github.com/pksep/chat_client/commit/446dedc3bee180861a829ca346ff8259f26d6880))
* lint ([4f8e084](https://github.com/pksep/chat_client/commit/4f8e0843b1f74eee6fdf52fe80dd710e3de8ba58))
* lint ([2f5ce17](https://github.com/pksep/chat_client/commit/2f5ce17156a1df796a5412a90292e1c9aeed421a))
* not dublicate calls in same topic ([bd4217a](https://github.com/pksep/chat_client/commit/bd4217aebb6f288b5532d0966ac8aae561de4ee3))
* pinned messages position when have call ([35a4336](https://github.com/pksep/chat_client/commit/35a4336cdc6dcd848480cd7b31cc3dac6cea8fee))
* popover styles ([6c9148d](https://github.com/pksep/chat_client/commit/6c9148d41352912e25c8fb0049d852c927d542ec))
* quality screen sharing ([fbc3ee1](https://github.com/pksep/chat_client/commit/fbc3ee169281a3df8dac5a1ddf48c4066d82f6d0))
* race condition in get messages ([f9fb4d3](https://github.com/pksep/chat_client/commit/f9fb4d36b8ca6cc143c4bb8ce5a62130118fa245))
* show call banner when have call ([e6909e8](https://github.com/pksep/chat_client/commit/e6909e81b4e1978a773e96069db957548eb9743a))
* styles ([f511650](https://github.com/pksep/chat_client/commit/f511650e0b411a3b0fe731a006187a671be66444))
* styles ([99c3bdc](https://github.com/pksep/chat_client/commit/99c3bdc8c7b0255f579c4f63574d8890729e89bb))
* styles in message media ([bd62e26](https://github.com/pksep/chat_client/commit/bd62e2648ed0d7ed80c7dcb57247ec9b3517df38))
* upgrade call ([5d26541](https://github.com/pksep/chat_client/commit/5d26541d6a1444646ad11e750d1e367fa7bda878))
* uploading and converting video ([5d2e723](https://github.com/pksep/chat_client/commit/5d2e723bb52e634d5d71de17a7b9feee05e7c78c))


### Features

* add background in call ([6b10431](https://github.com/pksep/chat_client/commit/6b10431a713fcbd7893e55ea856cb6ead278a213))
* add call history ([afee2ff](https://github.com/pksep/chat_client/commit/afee2ffcf348f7896ea5321ea6e1c4994ba36a11))
* add compare logic versions with rustore ([02e4acc](https://github.com/pksep/chat_client/commit/02e4accd0bf33c1c1c7dc57991326fc971e9bc4f))
* add create call logic without topic ([7358c22](https://github.com/pksep/chat_client/commit/7358c2234347ca08c84f6ef810c71b7d5f092a62))
* add emojies in call ([c2ee82b](https://github.com/pksep/chat_client/commit/c2ee82b796521d62862f92fb0ca3c08621263353))
* add modal for logout ([4403162](https://github.com/pksep/chat_client/commit/440316282958402e8d024004b9129679fdfcc145))
* add navigate-to-chat button, upgrade froup call info panel ([1ddd424](https://github.com/pksep/chat_client/commit/1ddd4248812011d794fc307f5101d0c7bacb75bc))
* add noto emojies ([c6f811e](https://github.com/pksep/chat_client/commit/c6f811e1bea3b92c9274d329e1e0760a2800cd00))
* add pagination for call page ([fd78fc9](https://github.com/pksep/chat_client/commit/fd78fc91cd90cad58ea96c60753554c30c681bc2))
* add pin for only me ([d0d2807](https://github.com/pksep/chat_client/commit/d0d28079a1137a12bed7ac54951e338eeff9b5b3))
* add profile modal ([7707216](https://github.com/pksep/chat_client/commit/770721644e08c75f234182c17cc681f0e422d220))
* add profile page, status and wallpapers ([3444acc](https://github.com/pksep/chat_client/commit/3444accc513dafe0c7bc2b18d51600ffe8902bab))
* add quality video streem ([cd4e022](https://github.com/pksep/chat_client/commit/cd4e0225f927523d017c68bb47aeba04da016ba0))
* add role in messages ([7e30091](https://github.com/pksep/chat_client/commit/7e30091102af84ef09dec87d1d20b059d7804513))
* add share logic ([eeb3fc3](https://github.com/pksep/chat_client/commit/eeb3fc3d8bcb672c164ec62bfd9147f6e13dbc0c))
* add topic call status and times ([45e71a9](https://github.com/pksep/chat_client/commit/45e71a9ee951793557acf4b14f189449d9b09a62))
* add unread count in filters ([fd8343a](https://github.com/pksep/chat_client/commit/fd8343adc62112a5cf3616747c666fdfa6440a9d))
* after error send message try again 3 minute ([839d2bc](https://github.com/pksep/chat_client/commit/839d2bca2b72affd305fb5b8c84dedd8bfdfc5a6))
* change background ([52f3f45](https://github.com/pksep/chat_client/commit/52f3f4573413f23a2802244be8a8b306a4335b03))
* empty contact list ([176b795](https://github.com/pksep/chat_client/commit/176b7959df285190b80d1b6e14ca3d408a6a1964))
* fix end call via havent user ([2cca534](https://github.com/pksep/chat_client/commit/2cca534f712fd93adcb86ee180a62a41a9a96788))
* fix notifications and sound ([9bbe465](https://github.com/pksep/chat_client/commit/9bbe4650f96bb74898566def758fc61c162e8e31))
* in call send event when user busy ([a39a322](https://github.com/pksep/chat_client/commit/a39a322892737b06b1b36d1d8b0c53e66cda1c6c))
* show ScreenShareIcon in web minimized ([f2302c7](https://github.com/pksep/chat_client/commit/f2302c7e2b36d4775dd3533dda9a73ab05812ba5))
* update call logic and styles ([300c23c](https://github.com/pksep/chat_client/commit/300c23c7215c9c150c3764e741230d6363997224))
* update emojies ([57d1b6b](https://github.com/pksep/chat_client/commit/57d1b6b0af389012cf0c12903afce57c86d29c90))
* update web version ([35aae61](https://github.com/pksep/chat_client/commit/35aae61b139f71eddfb2520ce908fe3811d8708a))

# [1.27.0](https://github.com/pksep/chat_client/compare/v1.26.0...v1.27.0) (2026-05-08)


### Bug Fixes

* content editor ([ceea203](https://github.com/pksep/chat_client/commit/ceea203eee65e4466f0dded6faaca2368c72ad29))
* lint ([33e1732](https://github.com/pksep/chat_client/commit/33e173268e2e0a7ff828b31898ee53847a9b230c))
* lint ([f5befdd](https://github.com/pksep/chat_client/commit/f5befdd2087fa23e6308865f7dd0e23a0d28a535))
* sound volume ([8e649c4](https://github.com/pksep/chat_client/commit/8e649c4c9ce8fed8561dfb451d12e3fcc5a71530))


### Features

* add info about read message ([3e0a62b](https://github.com/pksep/chat_client/commit/3e0a62b14a599c40af34bd27b43fce911f09d5e3))
* show reaction setters ([40c726a](https://github.com/pksep/chat_client/commit/40c726ae3acab5c31d9321b73856c09ffedd821b))

# [1.26.0](https://github.com/pksep/chat_client/compare/v1.25.0...v1.26.0) (2026-05-07)


### Bug Fixes

* edited text ([094c13c](https://github.com/pksep/chat_client/commit/094c13c21a3cd7b56501fc273cf4c1434d796acf))
* lint ([5d1087f](https://github.com/pksep/chat_client/commit/5d1087fd4292910b9984e27d3af691deebcce948))
* slider content type ([34d3c9f](https://github.com/pksep/chat_client/commit/34d3c9f257934489d6383509163702e6622fe4d9))
* style ([f585050](https://github.com/pksep/chat_client/commit/f585050c0a41a59c5b45a7dba07c1cdabc3742aa))
* styles ([bded7d7](https://github.com/pksep/chat_client/commit/bded7d712ff8867021556ad829e26461c75b7b04))
* styles ([40c5f38](https://github.com/pksep/chat_client/commit/40c5f38054b04eeb661fcca3770929f115c19f68))
* upload .mov too media ([e23e04e](https://github.com/pksep/chat_client/commit/e23e04e0581dc37faef092bc133c43e8d91e37bc))


### Features

* add content editor props and tools ([b213bc7](https://github.com/pksep/chat_client/commit/b213bc7da124dd9e890f4c62384d6dfaed9af94d))
* add logic for send media and files in text ([23c56d1](https://github.com/pksep/chat_client/commit/23c56d1ca152a0669619467fa70ed2dd0a866c18))
* redesign messages ([ff0edf3](https://github.com/pksep/chat_client/commit/ff0edf32a58413df9e45560e07dc365cb53233e4))

# [1.25.0](https://github.com/pksep/chat_client/compare/v1.24.0...v1.25.0) (2026-05-05)


### Bug Fixes

* bulk forward ([15ebc93](https://github.com/pksep/chat_client/commit/15ebc93b6c65a721ab07a0d1ce31bb38e44a2696))
* buttons ([ad05c8c](https://github.com/pksep/chat_client/commit/ad05c8c07ef7853d900934145e66f4033a288cce))
* call with screen sharing + full screen ([6af8047](https://github.com/pksep/chat_client/commit/6af804708601ae175c6dfbb569404de531a7e257))
* **chat:** stabilize message scrolling and media previews ([680d1cb](https://github.com/pksep/chat_client/commit/680d1cb320b94bd2cd085b6c815bb6836e171b12))
* disable status ([0d1336f](https://github.com/pksep/chat_client/commit/0d1336fa9066fa918f4fa9dce838f4b6121e361b))
* dont save cache in apk ([7af7446](https://github.com/pksep/chat_client/commit/7af7446e07285f7c0c3cc93151679f84cd056d37))
* dont show messages in another topics ([c86225d](https://github.com/pksep/chat_client/commit/c86225d89d5ef1b31fe159ec0ef9c51d6c0c3ac3))
* download in apk ([3dc26f5](https://github.com/pksep/chat_client/commit/3dc26f5ff2a6b5cefb429a788d7292eb9492e656))
* if not group admin delete add user button ([0f757a0](https://github.com/pksep/chat_client/commit/0f757a080c77b1876f2732db157016eaddec9011))
* last online text ([23c35db](https://github.com/pksep/chat_client/commit/23c35db6d6db35565bcadb99f9e602d44d0082df))
* lint ([c003e07](https://github.com/pksep/chat_client/commit/c003e076d2c507658b59852ac820959777c3fbd1))
* lint ([3f3a661](https://github.com/pksep/chat_client/commit/3f3a661b361217d76c656f565fab84408a99cb7b))
* lint ([c317c6a](https://github.com/pksep/chat_client/commit/c317c6a0f98707e7adc9c9ea915ee7448938f5a2))
* lint ([c33c4ea](https://github.com/pksep/chat_client/commit/c33c4ea9639d9d7750c6d8a6354bcedbf1063808))
* lint ([3eda5e8](https://github.com/pksep/chat_client/commit/3eda5e84653c6b54cd94e3da88661391c23d64c4))
* lint ([29b4a7d](https://github.com/pksep/chat_client/commit/29b4a7d3442d8fb6a450534ec8686b8b8ee7832a))
* lint ([659594c](https://github.com/pksep/chat_client/commit/659594ccdaaa0a680fae142d332adcbf8bf77d52))
* not disable microfon when screen sharing ([af6ae7a](https://github.com/pksep/chat_client/commit/af6ae7acbc74263588a4f62565edb7b86f002fcb))
* not open media in select message mode ([36e2f2a](https://github.com/pksep/chat_client/commit/36e2f2acfd5e8b78f5115ae9c73d14475b93ffc0))
* notification and unread message count ([fbefc16](https://github.com/pksep/chat_client/commit/fbefc16f610ab8acce68c76c62ba17b93adfe50e))
* packages ([9935706](https://github.com/pksep/chat_client/commit/993570694db7b9ba167facdbf9c336181c5f1cde))
* position for add topic ([16db979](https://github.com/pksep/chat_client/commit/16db97941b6cf70ba8dadf4a7344ad4be7a6ffd9))
* project in reconnect ([6841393](https://github.com/pksep/chat_client/commit/68413931de04854a0ea5ccb22d8b83d5f436dd26))
* read message logic ([62ea497](https://github.com/pksep/chat_client/commit/62ea497e73416607d85cea5bc20c08cb0362103e))
* read message logic ([1df5b55](https://github.com/pksep/chat_client/commit/1df5b55b728c06864a5ecf23e976dadc3e750f28))
* reseting ([465b95d](https://github.com/pksep/chat_client/commit/465b95d015437e9a29c2a66eb2c676582b428b25))
* set 0 unreadCount when read message ([ab87711](https://github.com/pksep/chat_client/commit/ab87711ac18235878d50e561889733d3f050fd64))
* slider ([5ec282d](https://github.com/pksep/chat_client/commit/5ec282d0371034fbaa5142a2325f24eefefdb3b5))
* style ([78f2eba](https://github.com/pksep/chat_client/commit/78f2eba8e49af7f3a0f19c183cc0b4dee6a58ad9))
* styles ([bcace50](https://github.com/pksep/chat_client/commit/bcace50b86ae0e3fa21b14b63f508570d5f24ed8))
* styles in mobile ([f20b2ed](https://github.com/pksep/chat_client/commit/f20b2ede7ff5579c85592481af83c1fa0c184b25))
* unpin message via modal ([e55a8de](https://github.com/pksep/chat_client/commit/e55a8de6925f3d180d812c2594d1fbc0a0b78f86))
* unread topic count ([f6ceeb5](https://github.com/pksep/chat_client/commit/f6ceeb513422a4a9bdec23c91f600b0348224d70))
* unreadcount when have system messages ([f82c83d](https://github.com/pksep/chat_client/commit/f82c83d29bea0c5fc0ccc5ae5760153a30c00417))
* update notification context ([1680ca0](https://github.com/pksep/chat_client/commit/1680ca0319608e164ec4e7e1a5c35ca80dfadbc4))
* upload and show video ([c681394](https://github.com/pksep/chat_client/commit/c681394f12f88821ca34e2f4bc859f652b2cce26))
* useUrlWatcher ([915b00b](https://github.com/pksep/chat_client/commit/915b00b05069b3ec0ea26d0424109e080b59af7d))
* useUrlWatcher ([68c059b](https://github.com/pksep/chat_client/commit/68c059befbd746d2604e083a9114823063927815))
* using SliderModal ([829d7ac](https://github.com/pksep/chat_client/commit/829d7ac4a1ada2527e3a23c02f538014af91e806))
* wait icon for text message ([b6d7fa3](https://github.com/pksep/chat_client/commit/b6d7fa3db3f32ccef4e96cbab9fcdfe29727ba07))
* поиск топика через юзер ([ef0ff5f](https://github.com/pksep/chat_client/commit/ef0ff5fd71de43f62bdfecc4182abdd54d3205aa))


### Features

* 1.5.8 Release ([3da5ef0](https://github.com/pksep/chat_client/commit/3da5ef03e5a1db274102838ccd522cd1e360ca83))
* add count in scroll to bottom button ([c24afc1](https://github.com/pksep/chat_client/commit/c24afc1f0863ca8346fecf8b21793201394fd9aa))
* add pts and media cache ([07b9f03](https://github.com/pksep/chat_client/commit/07b9f0396ff69a30cee9162caefd6e92cdf22efe))
* add pts and media cache ([1c5d76b](https://github.com/pksep/chat_client/commit/1c5d76b8a2a3e83087af0ee814de2dc3bd6dc616))
* add retry logic, when dont sent message ([4ce344e](https://github.com/pksep/chat_client/commit/4ce344e8f6fcb7ceb553d9bc9c8ea306b219d5f6))
* add voip calls and fix logic working calls ([b5a72d8](https://github.com/pksep/chat_client/commit/b5a72d8b9a633ec15c253cf4e4099c6ee02a07ad))
* buld delete and bulk forward ([067533f](https://github.com/pksep/chat_client/commit/067533f4077d310f3aa721808ee6f4d4676bf64f))
* new release ([cc57aac](https://github.com/pksep/chat_client/commit/cc57aac661001856a23f4f7fe21b07b5063ef97a))
* new release ([ac81126](https://github.com/pksep/chat_client/commit/ac81126671197fe51ae78b9df16d6c962a7dbdfa))
* redirect in chat via mobile, and delete notification if I already in chat ([a97f5d3](https://github.com/pksep/chat_client/commit/a97f5d3439471c1585e976d46b4cb87d2ae13bb2))
* start multiselect messages ([44dd1b7](https://github.com/pksep/chat_client/commit/44dd1b7bb9b38ecf606fe9d30333a3181f9dafc3))
* update yui ([94afb96](https://github.com/pksep/chat_client/commit/94afb96c9924f15253fcc018971ae320c7a526d1))
* update yui ([452d27d](https://github.com/pksep/chat_client/commit/452d27d04e98e8132e05d509e7fd2444621e5262))

# [1.24.0](https://github.com/pksep/chat_client/compare/v1.23.1...v1.24.0) (2026-04-06)


### Bug Fixes

* apk link ([2747063](https://github.com/pksep/chat_client/commit/274706373caa711d60a40bc9c8594ce83990fffe))
* chat in blocked apk ([f467639](https://github.com/pksep/chat_client/commit/f467639ab4f60062c48b6e1471b6ed7b14967225))
* lint ([17291b0](https://github.com/pksep/chat_client/commit/17291b09a7e784a58c5e4dc0bbb9754d1d277cad))
* lint ([bf4c376](https://github.com/pksep/chat_client/commit/bf4c3767c9da237b280eca8db681c6854753c931))
* lint ([bc758be](https://github.com/pksep/chat_client/commit/bc758be9b728d70a6869f34c1c7399cdaef65b01))
* logic when reconnecting ([b32c750](https://github.com/pksep/chat_client/commit/b32c75022870391d8c3bd545d55673baa9768c3d))
* styles ([c2bceca](https://github.com/pksep/chat_client/commit/c2bceca14ec78d3477d40e0eb9534a5cd3fffe2a))
* update topics when connection lost ([2f1f49a](https://github.com/pksep/chat_client/commit/2f1f49a967a8f8a7867544a70d43234aae0b6cec))


### Features

* add chatsToolbar ([d98c25e](https://github.com/pksep/chat_client/commit/d98c25e9fcde647cd742edc6e76e201c88c6418e))
* add waitConnection component ([3568f4d](https://github.com/pksep/chat_client/commit/3568f4d8f46069261db52af14fbe4b36343ee06d))

## [1.23.1](https://github.com/pksep/chat_client/compare/v1.23.0...v1.23.1) (2026-04-03)


### Bug Fixes

* contextMenu ([0cf42f9](https://github.com/pksep/chat_client/commit/0cf42f93a6f65a10ddd0c0a950889056f3e04e53))
* delete loading, save cached messages ([d786ae1](https://github.com/pksep/chat_client/commit/d786ae1b71e23a5c8cf9079e888b51ce4cadc770))
* delete refresh token ([2025d0e](https://github.com/pksep/chat_client/commit/2025d0e33926eaab37b0c725703dcc9f51a3c4ff))
* delete refresh token ([e0c75f3](https://github.com/pksep/chat_client/commit/e0c75f38b6c4d3f6157218248d20e345fed192ba))
* empty content, upload with minio, show wait connection ([2b76d14](https://github.com/pksep/chat_client/commit/2b76d1457fc7a3180f657303595dbf9424d47a57))
* layout for 2 screen ([0ef7d49](https://github.com/pksep/chat_client/commit/0ef7d49b77f3a47493db0574b94fc3686f298550))
* lint ([bffa7b9](https://github.com/pksep/chat_client/commit/bffa7b911ab3df863dd4a60ff76d7eba059b6a39))
* lint ([ffd7a69](https://github.com/pksep/chat_client/commit/ffd7a69e3e6a91b9d7d545944b61ef216cc32135))
* lint ([488814f](https://github.com/pksep/chat_client/commit/488814f4f2536ab76984f94923d4079c813cb55c))
* redirect in 401 ([0aa8704](https://github.com/pksep/chat_client/commit/0aa8704ff0751e9c6571554c717877680dfb6fe1))

# [1.23.0](https://github.com/pksep/chat_client/compare/v1.22.0...v1.23.0) (2026-04-02)


### Features

* new release ([b003339](https://github.com/pksep/chat_client/commit/b00333953628c9a8de495f5b47a848d4515f8dc1))
* new release ([44a036a](https://github.com/pksep/chat_client/commit/44a036addaebc0c287d178b7940c4439dd7fc275))

# [1.22.0](https://github.com/pksep/chat_client/compare/v1.21.0...v1.22.0) (2026-04-02)


### Bug Fixes

* Containerfile ([49ccd5c](https://github.com/pksep/chat_client/commit/49ccd5c6591faa19a6b0372bcfbc40ce1234680e))
* lint ([6b6d441](https://github.com/pksep/chat_client/commit/6b6d4418d15ad07a314f97aa5071d35411d22cbe))
* lint ([adbab5a](https://github.com/pksep/chat_client/commit/adbab5ad39d41dd3beee8ccee255aaf4146dbce3))
* read messages in mozilia ([6a14cb1](https://github.com/pksep/chat_client/commit/6a14cb17b5f57762ff28fbe03f87b1a110283e7e))
* scrolling ([d3ad1a5](https://github.com/pksep/chat_client/commit/d3ad1a557ecde830b728cf18f7ed54cf8a7d8b16))


### Features

* add nginx.conf ([4147b89](https://github.com/pksep/chat_client/commit/4147b895a88c14c1630ba38bf7f1e11d9ac744df))

# [1.21.0](https://github.com/pksep/chat_client/compare/v1.20.1...v1.21.0) (2026-04-01)


### Features

* update sep-yui ([2409779](https://github.com/pksep/chat_client/commit/2409779aa870a42e279b1c8738e6f87ca2fb536e))

## [1.20.1](https://github.com/pksep/chat_client/compare/v1.20.0...v1.20.1) (2026-04-01)


### Bug Fixes

* links when paste in input without focus ([62fee9e](https://github.com/pksep/chat_client/commit/62fee9e0ba6acbbec8cd62d0d0637aae7d33f183))
* socket connection ([eaf7226](https://github.com/pksep/chat_client/commit/eaf7226142566737e475d437cdf3c6b626409846))

# [1.20.0](https://github.com/pksep/chat_client/compare/v1.19.2...v1.20.0) (2026-04-01)


### Bug Fixes

* call ([2497d39](https://github.com/pksep/chat_client/commit/2497d39391f2343a8dab4cdcbac286c3ab387aa4))
* call styles ([cc541f1](https://github.com/pksep/chat_client/commit/cc541f1fc0bfb698520af8e9e6e76388d32614db))
* call styles ([ff408a3](https://github.com/pksep/chat_client/commit/ff408a3fa9101f827a2ab2af2f2cfc6dd9db4910))
* call-modal__remote-video object fit ([0da5fee](https://github.com/pksep/chat_client/commit/0da5fee3a05639f29f6eb5830928e53999c24fca))
* clearChatAuthSession after error ([90b2070](https://github.com/pksep/chat_client/commit/90b207082fa6412f7fbe56ad8f973f0c3cf0b671))
* download file ([927bef2](https://github.com/pksep/chat_client/commit/927bef2e1f7684ed65efb839c1b7b11de45a84e1))
* download file name ([9eac655](https://github.com/pksep/chat_client/commit/9eac655125a2f78ac97ebdf8047fcc15120133bf))
* env example ([6f1129c](https://github.com/pksep/chat_client/commit/6f1129c09c42f26a2281895935b01726595c7c76))
* forward message ([d0c8e23](https://github.com/pksep/chat_client/commit/d0c8e23a0865f7b871e986b38094f8b8c4867de7))
* group call styles ([ae8f34d](https://github.com/pksep/chat_client/commit/ae8f34dc69588f8c2acbaa6cbd9b4f9a593f1470))
* info styles ([56a0fed](https://github.com/pksep/chat_client/commit/56a0fedd83cb14401d932e678ea07c7a3fa9e448))
* input focus and style call ([2173815](https://github.com/pksep/chat_client/commit/2173815bf9fb200398f446ca8bc687c844027418))
* lint ([b9f70ca](https://github.com/pksep/chat_client/commit/b9f70ca7944ea7f32c066ea973a6bc456a421c5c))
* lint ([e34481c](https://github.com/pksep/chat_client/commit/e34481c8009217c57881d13e3fbbd96d6b3db5db))
* lint ([f1967fc](https://github.com/pksep/chat_client/commit/f1967fc3b5bc529a49e305873d24f0035b65be78))
* lint ([9cabdf6](https://github.com/pksep/chat_client/commit/9cabdf663ccea01babd7a04857cdb5734a3bd906))
* lint ([ee05c2e](https://github.com/pksep/chat_client/commit/ee05c2ec38a9bc62d9b6f366e15abd857497b8d0))
* lint ([46175aa](https://github.com/pksep/chat_client/commit/46175aad556d3c596338b17598ea710ef3d5d3cc))
* logic refresh token ([208fb32](https://github.com/pksep/chat_client/commit/208fb320db09cc0cc4ed205be8e0647d3659e449))
* notification click ([3e41255](https://github.com/pksep/chat_client/commit/3e41255db93708f03ddb1a26997b2a0622821498))
* packages ([a2ffaef](https://github.com/pksep/chat_client/commit/a2ffaef2c5bed8239a815cab08dcbe4eddb60085))
* refine chat token flow ([3911093](https://github.com/pksep/chat_client/commit/39110935df7516c472d406c9d824dbf623065b98))
* scroll to down button position ([cabf40f](https://github.com/pksep/chat_client/commit/cabf40f03ba36069dffea9621904220a74af51b2))
* select user ([31d0d81](https://github.com/pksep/chat_client/commit/31d0d8119d78bf0d7cd0a90e5d4e8b0c14f8d6d7))
* styles ([0fdef35](https://github.com/pksep/chat_client/commit/0fdef35815588af9796f8f8a0e5051e2efbe27ab))
* topic content scroll ([6731b0a](https://github.com/pksep/chat_client/commit/6731b0a5507f898311cbe7d0ab2da9cab1d2d625))
* upload file ([336997d](https://github.com/pksep/chat_client/commit/336997d0476a56bfca4d9a3b4b20db375e0ad21d))
* use token from chat_server and fix design ([c240659](https://github.com/pksep/chat_client/commit/c24065923b47ea687542fb813662bb690fd0e6d8))
* yui version ([669176f](https://github.com/pksep/chat_client/commit/669176fc912dfce1b811572e9a51df3508495520))


### Features

* add call logic ([3c3c84b](https://github.com/pksep/chat_client/commit/3c3c84b29ae05f85a03210b2e251e023ece6e408))
* add call logic ([35bf58f](https://github.com/pksep/chat_client/commit/35bf58f53de0a40a65e344c1eac5a1bd91d405e9))
* add call logic ([ee2e5ee](https://github.com/pksep/chat_client/commit/ee2e5ee18dac27d16a05828196581d9e130d2001))
* add call styles ([724486c](https://github.com/pksep/chat_client/commit/724486c85ecb5dba824460214290d2e197247740))
* add camera in popover attach file ([94db707](https://github.com/pksep/chat_client/commit/94db7077de2149ff0db6b977c8a895f076775281))
* add chat_container_alert for dev ([37369be](https://github.com/pksep/chat_client/commit/37369be746a26a742365230e051b7fca1751c44b))
* add copy text button ([1500198](https://github.com/pksep/chat_client/commit/15001985736655279012bb094f5deb9d61ef4641))
* add handup ([62814d2](https://github.com/pksep/chat_client/commit/62814d2b1793838bfa1c723b7b87f3f39db58f3c))
* add organization logic ([7ab0613](https://github.com/pksep/chat_client/commit/7ab06133e22bf7113ae793fe3c1881d693ba55d9))
* add versions ([36d6212](https://github.com/pksep/chat_client/commit/36d6212de7e42c196f40234025a856c63775f08b))
* add webrtc ([de5dceb](https://github.com/pksep/chat_client/commit/de5dcebf5af88b4c75012c0674cf94ca5db373a7))
* change jitsi and webrtc to livekit ([3754f8b](https://github.com/pksep/chat_client/commit/3754f8b6db83e19b5b263e59a112dc25b91c96f7))
* default page ([e89960d](https://github.com/pksep/chat_client/commit/e89960d73885ad5baeb27e3b5c0e5f505154c3bd))
* new release ([29103fa](https://github.com/pksep/chat_client/commit/29103fa20894644d56b3d3c77d70cd1e0283dfa9))
* new release! ([675ffc8](https://github.com/pksep/chat_client/commit/675ffc8dbe6585625899bc500618774b8d1b3199))
* restore basicSsl ([e043a84](https://github.com/pksep/chat_client/commit/e043a84344ddd5185d99da4077c83284d2ed5f40))
* update sep-yui ([69d4302](https://github.com/pksep/chat_client/commit/69d4302ff984189fc672318ed3c9588e5bb27aaa))

## [1.19.2](https://github.com/pksep/chat_client/compare/v1.19.1...v1.19.2) (2026-03-06)


### Bug Fixes

* gradient ([22148e4](https://github.com/pksep/chat_client/commit/22148e42071cf71219e8fc48bd52d8f14a2fa916))

## [1.19.1](https://github.com/pksep/chat_client/compare/v1.19.0...v1.19.1) (2026-03-06)


### Bug Fixes

* styles ([fcb3cd1](https://github.com/pksep/chat_client/commit/fcb3cd1fc41cd0bda1c7f9a2ff8eedfecbe1fcfe))

# [1.19.0](https://github.com/pksep/chat_client/compare/v1.18.0...v1.19.0) (2026-03-05)


### Bug Fixes

* avatar show ([2b58765](https://github.com/pksep/chat_client/commit/2b587652cc8e668b7285384837ab42cc267a71ce))
* lint ([943138e](https://github.com/pksep/chat_client/commit/943138e1a498f2cea208b4982202bdf0d525e836))


### Features

* add online logic ([fba0132](https://github.com/pksep/chat_client/commit/fba01323455bbe75b45ce028d4a104509c1bd6bd))

# [1.18.0](https://github.com/pksep/chat_client/compare/v1.17.0...v1.18.0) (2026-03-03)


### Bug Fixes

* add useBackButton logic ([82423c9](https://github.com/pksep/chat_client/commit/82423c9ba717c255f6217b15a21f9c44e100c142))
* delete console log ([5abe481](https://github.com/pksep/chat_client/commit/5abe481efc4ea752b817df367f6ccab5767531de))
* lint ([53788ef](https://github.com/pksep/chat_client/commit/53788efb2b57190f882db59e56b8b8573e253dd4))
* lint ([55e7670](https://github.com/pksep/chat_client/commit/55e767084b32e5944af1e837f41358019f94f853))
* lint ([ebdf43d](https://github.com/pksep/chat_client/commit/ebdf43d6ff7a27e25902c67d71f59192409fe906))
* lint ([1c13d61](https://github.com/pksep/chat_client/commit/1c13d615b5f80f2dfb28bf3f78216857e5b38ec6))
* read logic ([e5a13da](https://github.com/pksep/chat_client/commit/e5a13da47f6f1645e8278bacc177a3d52a5cd42a))
* user avatars ([9183680](https://github.com/pksep/chat_client/commit/91836809bb1558783593f5da34092d484714656e))


### Features

* add tag user logic ([907382f](https://github.com/pksep/chat_client/commit/907382f5e4873a43f29e473edd81dca2f905beec))
* add unread messages section ([a2d9164](https://github.com/pksep/chat_client/commit/a2d9164b0f081304fd3f730bd84a72b645d192e1))
* refactor big components ([dffb0fb](https://github.com/pksep/chat_client/commit/dffb0fb87ee508ae890e25507cce5dd829a3b637))

# [1.17.0](https://github.com/pksep/chat_client/compare/v1.16.2...v1.17.0) (2026-02-25)


### Bug Fixes

* focus in inputs ([a0ac862](https://github.com/pksep/chat_client/commit/a0ac862c6591a7ecbe37df3e1ae687a9fee2712c))
* forward without content ([99a08a1](https://github.com/pksep/chat_client/commit/99a08a134dab2810954c1b5870ab5c244b8f3ee4))
* lint ([9a518fa](https://github.com/pksep/chat_client/commit/9a518fa05cca643c6d8fdc3cbb1df1784cebf193))


### Features

* add forward message logic ([2a059db](https://github.com/pksep/chat_client/commit/2a059db97b1e38d8612ed2ceb56ec6a259a3d2a9))

## [1.16.2](https://github.com/pksep/chat_client/compare/v1.16.1...v1.16.2) (2026-02-24)


### Bug Fixes

* messages scroll ([2c3246f](https://github.com/pksep/chat_client/commit/2c3246f02192fba2a5d12af6bc94f9db2f8fc696))

## [1.16.1](https://github.com/pksep/chat_client/compare/v1.16.0...v1.16.1) (2026-02-24)


### Bug Fixes

* key for v-for ([3a17ef2](https://github.com/pksep/chat_client/commit/3a17ef2ca1b378212d5a7276fc9af4ecc9c6018b))
* lint ([3663926](https://github.com/pksep/chat_client/commit/36639262f7d173dab3dc2dc20cc812f28715956e))
* messages media style and add button for scroll to bottom ([dd23bc2](https://github.com/pksep/chat_client/commit/dd23bc24446946aa83057e7097a382e1f8bd9606))

# [1.16.0](https://github.com/pksep/chat_client/compare/v1.15.0...v1.16.0) (2026-02-24)


### Bug Fixes

* click notification, not open in new tab ([f4a0029](https://github.com/pksep/chat_client/commit/f4a00294bc796cc6b9f3249228c9de1c65d025a4))
* scroll to message ([9692df2](https://github.com/pksep/chat_client/commit/9692df279c3cdcfedaafc2306f646d4da59c3713))


### Features

* update yui for avatars ([1b905fc](https://github.com/pksep/chat_client/commit/1b905fc119edafb928978fc217c7b49b1fda71ad))

# [1.15.0](https://github.com/pksep/chat_client/compare/v1.14.0...v1.15.0) (2026-02-20)


### Features

* release ([0624b45](https://github.com/pksep/chat_client/commit/0624b450bf352a436bae8231fd028abfefaf9742))

# [1.14.0](https://github.com/pksep/chat_client/compare/v1.13.2...v1.14.0) (2026-02-20)


### Features

* sync verions ([2ad395a](https://github.com/pksep/chat_client/commit/2ad395aff6020fc24e2b1bc658e102fa7b904dda))

## [1.13.2](https://github.com/pksep/chat_client/compare/v1.13.1...v1.13.2) (2026-02-20)


### Bug Fixes

* new topic ([de11128](https://github.com/pksep/chat_client/commit/de111284ebcf62e1dab6abb513fcccc8d06a001a))

## [1.13.1](https://github.com/pksep/chat_client/compare/v1.13.0...v1.13.1) (2026-02-20)


### Bug Fixes

* slider and styles ([08ba466](https://github.com/pksep/chat_client/commit/08ba46635ee489351861db99ddaf98e1b01021dc))

# [1.13.0](https://github.com/pksep/chat_client/compare/v1.12.2...v1.13.0) (2026-02-19)


### Features

* add icons ([987c8ff](https://github.com/pksep/chat_client/commit/987c8ffbe36c85bee4de5aa49b1bf71cab287203))

## [1.12.2](https://github.com/pksep/chat_client/compare/v1.12.1...v1.12.2) (2026-02-18)


### Bug Fixes

* if tab active, not get notification ([bffa637](https://github.com/pksep/chat_client/commit/bffa637e3eba10a039e087b4c8362d3a5e6b9c86))
* login logic ([9c81583](https://github.com/pksep/chat_client/commit/9c81583cf425234d1e44136b6441e95bffd5b6d3))
* service-worker ([010947f](https://github.com/pksep/chat_client/commit/010947f3c851dfd82605f184394a389628785dff))
* styles ([fe464e1](https://github.com/pksep/chat_client/commit/fe464e1f00a1ffbc91a1d78e39d6f585aa627bdc))
* styles ([e3b42cd](https://github.com/pksep/chat_client/commit/e3b42cd18a8cdda150d8d58dbffa355b5d3538b0))
* styles and scroll ([e147fe6](https://github.com/pksep/chat_client/commit/e147fe60f39107381d1da4224577e47d57df3469))

## [1.12.1](https://github.com/pksep/chat_client/compare/v1.12.0...v1.12.1) (2026-02-17)


### Bug Fixes

* not markAsRead if browser not active ([78c5a42](https://github.com/pksep/chat_client/commit/78c5a423bde5081e71dfb824ffacd9338c5bed75))

# [1.12.0](https://github.com/pksep/chat_client/compare/v1.11.0...v1.12.0) (2026-02-17)


### Bug Fixes

* lint ([35af413](https://github.com/pksep/chat_client/commit/35af41336ca1f2d9cb1a5be8cc5607497b75c31e))


### Features

* reply and fix styles ([69c97ee](https://github.com/pksep/chat_client/commit/69c97ee66150665b8b447c026f507ca63d3661c3))

# [1.11.0](https://github.com/pksep/chat_client/compare/v1.10.1...v1.11.0) (2026-02-16)


### Features

* release ([6a196d6](https://github.com/pksep/chat_client/commit/6a196d604236abbc7e0b621a2957f1179c52586d))

## [1.10.1](https://github.com/pksep/chat_client/compare/v1.10.0...v1.10.1) (2026-02-16)


### Bug Fixes

* height menu ([c2f272b](https://github.com/pksep/chat_client/commit/c2f272b131fae5073817f40e0c68539c3293fd2e))

# [1.10.0](https://github.com/pksep/chat_client/compare/v1.9.0...v1.10.0) (2026-02-16)


### Bug Fixes

* downloadFile ([7524085](https://github.com/pksep/chat_client/commit/75240856e73c874d760aaf81311bddbfccbea8b3))
* drag ([0bf99cc](https://github.com/pksep/chat_client/commit/0bf99ccf5d957f0741326427a7d7b14b7f2a4007))
* focus chat input ([1afa3c5](https://github.com/pksep/chat_client/commit/1afa3c54e9d582310f25053c90190fdb47936340))
* initial read logic ([a663604](https://github.com/pksep/chat_client/commit/a66360407d49571cfb35c02164341e7d5ee5dbb8))
* lint ([ae37045](https://github.com/pksep/chat_client/commit/ae370450c6aefb10d26cedba88726aa58f69f792))
* lint ([8166f93](https://github.com/pksep/chat_client/commit/8166f9347b481d893a7b7157c348dc194fd15788))


### Features

* add editing message ([f6c2c40](https://github.com/pksep/chat_client/commit/f6c2c4063373ef3d535c89521ce1c9371a82605d))
* add webworker ([05fca21](https://github.com/pksep/chat_client/commit/05fca210d2528c96bd20f37cf928c0af4fa8ca7a))
* merge dm and groups logic ([a221452](https://github.com/pksep/chat_client/commit/a221452ff1580d4d738034139d1764b16801bbdc))
* navigate to pin message logic ([44851cb](https://github.com/pksep/chat_client/commit/44851cb8f38c5f743eb705125abd7095f14a25f8))
* start pin message logic ([54a458f](https://github.com/pksep/chat_client/commit/54a458fd02ba28fb5b6c0562f22b04c1ac787f7d))
* update read status in groups ([347ac9d](https://github.com/pksep/chat_client/commit/347ac9d0f0cc47c3087c619cb0d0661df6d1c434))

# [1.9.0](https://github.com/pksep/chat_client/compare/v1.8.0...v1.9.0) (2026-02-10)


### Bug Fixes

* config ([2654d9c](https://github.com/pksep/chat_client/commit/2654d9c83290f14df9ec490e1cd0af12e5bede48))
* modal for mobile ([533f76d](https://github.com/pksep/chat_client/commit/533f76d6b11d78565e662ac6a0f51f7cc12e1840))


### Features

* add download buttons ([da21b3a](https://github.com/pksep/chat_client/commit/da21b3afadd88f54414e969850e2ea0a3047a3ab))
* save route redirects ([55ebf73](https://github.com/pksep/chat_client/commit/55ebf7336e7d1bb968f5ee4936aa0d87aef3821b))

# [1.8.0](https://github.com/pksep/chat_client/compare/v1.7.2...v1.8.0) (2026-02-06)


### Bug Fixes

* lint ([2fd6dbc](https://github.com/pksep/chat_client/commit/2fd6dbcd33befe01c5192dec2cb5bc2d82bfd21e))


### Features

* logic kick and leave from group ([12b1eaa](https://github.com/pksep/chat_client/commit/12b1eaa85bd19428ab23f274ddac56b017bc4b1b))

## [1.7.2](https://github.com/pksep/chat_client/compare/v1.7.1...v1.7.2) (2026-02-06)


### Bug Fixes

* bar problem ([2c0aaf1](https://github.com/pksep/chat_client/commit/2c0aaf14abe0ea0c0ca26be70ae28042a845f545))

## [1.7.1](https://github.com/pksep/chat_client/compare/v1.7.0...v1.7.1) (2026-02-05)


### Bug Fixes

* lint ([01fdc79](https://github.com/pksep/chat_client/commit/01fdc79a70ac0acea3590713b1b982600a2a8f76))
* styles and long message ([5e31d86](https://github.com/pksep/chat_client/commit/5e31d86c3793d4ba4e48fe44076001a301004dae))

# [1.7.0](https://github.com/pksep/chat_client/compare/v1.6.0...v1.7.0) (2026-02-04)


### Features

* add loading files ([f4cef5e](https://github.com/pksep/chat_client/commit/f4cef5e67defdb8ef76434ab86dfaea3f08ff497))
* add thumbnails ([524be92](https://github.com/pksep/chat_client/commit/524be9279887c46107a2fda351cf157bec2aa4e3))
* ex in medias ([e29f6b9](https://github.com/pksep/chat_client/commit/e29f6b99fffa741c3a1f1538ac31856d54eea709))

# [1.6.0](https://github.com/pksep/chat_client/compare/v1.5.1...v1.6.0) (2026-02-02)


### Bug Fixes

* deleting medias ([949d8b6](https://github.com/pksep/chat_client/commit/949d8b6425dd56dd05a30bab623b053f8931dda1))
* lint ([9faddb4](https://github.com/pksep/chat_client/commit/9faddb48b12af403f34e5836e71009618e80c06a))
* lint ([59c6baf](https://github.com/pksep/chat_client/commit/59c6baf8c5b7c96c3ffc791d6f81f7aef716bb66))


### Features

* add mobile modal ([aed121c](https://github.com/pksep/chat_client/commit/aed121c50f8a57f2fc0cc06c042fce1176d7af63))
* delete message ([b4f6c42](https://github.com/pksep/chat_client/commit/b4f6c4240b8a6d601a88654f61299a3ba265ac03))

## [1.5.1](https://github.com/pksep/chat_client/compare/v1.5.0...v1.5.1) (2026-01-29)


### Bug Fixes

* create and edit groups ([a2f0239](https://github.com/pksep/chat_client/commit/a2f0239b237b505132a1f0e72a3c39d55c0bfc80))
* lint ([17c224b](https://github.com/pksep/chat_client/commit/17c224b2d9db9c9c1cb1cef8dcf38f9a008c3271))
* lint ([c64758f](https://github.com/pksep/chat_client/commit/c64758fdb6d4c64138099b31311545e5997b7274))

# [1.5.0](https://github.com/pksep/chat_client/compare/v1.4.0...v1.5.0) (2026-01-29)


### Features

* release ([fa27a04](https://github.com/pksep/chat_client/commit/fa27a04724ae7a630cc4710475bc54afcc15fe09))

# [1.4.0](https://github.com/pksep/chat_client/compare/v1.3.4...v1.4.0) (2026-01-29)


### Features

* release ([c2a7060](https://github.com/pksep/chat_client/commit/c2a7060518a005ac70ad53c3a1b2bbe5bd576572))

## [1.3.4](https://github.com/pksep/chat_client/compare/v1.3.3...v1.3.4) (2026-01-29)


### Bug Fixes

* lint ([f3e92f1](https://github.com/pksep/chat_client/commit/f3e92f1a541928f2c23fd7b8c1db649b4c0df6f2))
* loading and swipe ([55e3406](https://github.com/pksep/chat_client/commit/55e34064a033091208007639813e68d87fe90081))
* redirects ([fd4b29a](https://github.com/pksep/chat_client/commit/fd4b29a77d192c4eb1649b9de8d5b5d66ca83ade))

## [1.3.3](https://github.com/pksep/chat_client/compare/v1.3.2...v1.3.3) (2026-01-29)


### Bug Fixes

* css + swipes + scroll ([6575dd2](https://github.com/pksep/chat_client/commit/6575dd2078a41bc78c04d6877e72110be91d0174))
* lint ([a691a19](https://github.com/pksep/chat_client/commit/a691a190acb0f8afe212a31c91602040d6d04a3a))

## [1.3.2](https://github.com/pksep/chat_client/compare/v1.3.1...v1.3.2) (2026-01-28)


### Bug Fixes

* scroll ([700cd0f](https://github.com/pksep/chat_client/commit/700cd0fa8167d5c6d1fcae8556935b1841ef85d7))

## [1.3.1](https://github.com/pksep/chat_client/compare/v1.3.0...v1.3.1) (2026-01-28)


### Bug Fixes

* modal css ([57de1c1](https://github.com/pksep/chat_client/commit/57de1c1807276920d735efe59f05c82647c2345b))

# [1.3.0](https://github.com/pksep/chat_client/compare/v1.2.1...v1.3.0) (2026-01-28)


### Bug Fixes

* max-width 30 ch ([880b78b](https://github.com/pksep/chat_client/commit/880b78b78af64c137e2ec336fbc879c0d6ba6a30))
* message article 100%, not max-content ([5de4ae7](https://github.com/pksep/chat_client/commit/5de4ae76709f3c758dcf7c6643860b5029fadee2))
* path to navigation ([04eb42a](https://github.com/pksep/chat_client/commit/04eb42a28b3e1f50900013c4575fe944476b2cf3))
* pin icon with design match ([4d53831](https://github.com/pksep/chat_client/commit/4d53831550fb81c135de78ab5deced0a3afd4179))


### Features

* add useNewInformationModal composable ([8beb362](https://github.com/pksep/chat_client/commit/8beb3623e0709e09b701136ac79f9e8c76f925bb))
* add useNewInformationModal composable for form state ([0aed27a](https://github.com/pksep/chat_client/commit/0aed27a27ea5959e7e536be81499c4e1265196c6))
* fix group creation and member data handling ([6ec0531](https://github.com/pksep/chat_client/commit/6ec0531d857f2836592ae0f8f9a1d11af335b064))
* fix mobile modal layout and contact list overflow ([b6acebc](https://github.com/pksep/chat_client/commit/b6acebc3b2fcf03844ca6a50519521824e014d7b))
* fix mobile modal padding alignment ([34a67d7](https://github.com/pksep/chat_client/commit/34a67d7fd8717140ca238e8a73e594a8581ce9d8))
* fix width and no_author margin ([2fda9b9](https://github.com/pksep/chat_client/commit/2fda9b9131c514267883d56ba40e7f2fd4d2a05b))
* initals realized ([7b38e19](https://github.com/pksep/chat_client/commit/7b38e191b0674c7918f46a23b29f5e7e96724b77))
* prevent header click action on AI route ([377be80](https://github.com/pksep/chat_client/commit/377be80489011a13b33a2f1b947e2546d5e44437))
* wrap loading indicators in centered modals ([8fb4942](https://github.com/pksep/chat_client/commit/8fb49429e6e9eff0975ab007bb553bc116c949fc))

## [1.2.1](https://github.com/pksep/chat_client/compare/v1.2.0...v1.2.1) (2026-01-28)


### Bug Fixes

* group action via mobile ([752d467](https://github.com/pksep/chat_client/commit/752d4678ca26d881529f5f69977f07ff5ecd5186))
* lint ([762d6dc](https://github.com/pksep/chat_client/commit/762d6dc60a8f48979571aacedcc3c8fa8df88ea8))

# [1.2.0](https://github.com/pksep/chat_client/compare/v1.1.0...v1.2.0) (2026-01-27)


### Bug Fixes

* console logs ([f427efe](https://github.com/pksep/chat_client/commit/f427efe680b81d27d82ad18602a6e9e545a3fdbd))
* getting group ([4aab65c](https://github.com/pksep/chat_client/commit/4aab65ccc825e110d466525db24aa62a1a399e1f))
* lint ([2c64b67](https://github.com/pksep/chat_client/commit/2c64b67cb28624ebc44cae60d86d0db2be0eb584))
* lint ([5b029b4](https://github.com/pksep/chat_client/commit/5b029b4cae67805f47a818c661126bde27dfa9a5))
* sorting ([06e667d](https://github.com/pksep/chat_client/commit/06e667d899b74fa25b699170e3fd8f19ee74e83c))
* sorting if havent last message ([8208cac](https://github.com/pksep/chat_client/commit/8208cac8b21ee64f7c98ef7c06fee3480ff06374))
* unreadMessageCount ([318a7a6](https://github.com/pksep/chat_client/commit/318a7a6c0fe48a299365404db412af78e905dd0a))


### Features

* reconnecting socket ([d9498e5](https://github.com/pksep/chat_client/commit/d9498e5d191b276b32616d9b6d48ec464031d0d6))

# [1.1.0](https://github.com/pksep/chat_client/compare/v1.0.0...v1.1.0) (2026-01-26)


### Bug Fixes

* clear comments and change after lint ([9677de2](https://github.com/pksep/chat_client/commit/9677de279334e1c0499b45e9ace8bf369add67f4))
* isMobile error ([24b41d2](https://github.com/pksep/chat_client/commit/24b41d21e76cfe0fbb3c999de0322fc8fcceea50))
* message content bubble ([658f5e3](https://github.com/pksep/chat_client/commit/658f5e34ab07681beb87469c88a2188ec470c143))
* remove comments ([ed028de](https://github.com/pksep/chat_client/commit/ed028de1edf503c343f3ca83ea828e8993676218))
* sizes of unicode smiles ([76406cf](https://github.com/pksep/chat_client/commit/76406cf0489b023b622ffff0a36a03a9e407bb2f))


### Features

* add overflow-x hidden ([96dbefa](https://github.com/pksep/chat_client/commit/96dbefa636e7d302bfc1840e4d9609153b0656b2))
* adjust message bubble padding and icon size ([8652887](https://github.com/pksep/chat_client/commit/865288700f4c466f14e6d75bd5c1316734f93a01))
* enhance mobile navigation with context-aware back button for PWA ([98b441e](https://github.com/pksep/chat_client/commit/98b441e1b7c417b3230a46057dfa1c7bd7b198f7))
* improve collapse button styling and topic active state ([9063c95](https://github.com/pksep/chat_client/commit/9063c951d8dd41b630c0550867d028210e3f989d))
* show message status icons for all messages ([4022f2e](https://github.com/pksep/chat_client/commit/4022f2e56627a63faf27e50ea4a792caa72556f8))
* update UI styles and temporarily disable features ([9842ae9](https://github.com/pksep/chat_client/commit/9842ae9e04c660541eec1797427652d3299c1d13))

# 1.0.0 (2026-01-26)


### Bug Fixes

* -90 deg size ([d4e2e29](https://github.com/pksep/chat_client/commit/d4e2e2923d434b168553e5276bc2bbff99662921))
* add access to camera ([4b9b2a6](https://github.com/pksep/chat_client/commit/4b9b2a6b723b7788d4d0b65d1c7552e738324639))
* Add E2E tests for chat core and configure Playwright ([af4fed3](https://github.com/pksep/chat_client/commit/af4fed37c7af5ee7a7414c0916f4b11b39490e81))
* add in state details opening ([b22fd14](https://github.com/pksep/chat_client/commit/b22fd140fde5fd12e201371ed9c46cac70cb736f))
* Add mobile responsive styles and text truncation fixes ([af0e6df](https://github.com/pksep/chat_client/commit/af0e6df2f25f3a3eff93acc54c94115537be14a6))
* add rules and implement notification ([ad99297](https://github.com/pksep/chat_client/commit/ad99297c5ee87499d0170bc1dd45f12c08e93a56))
* add ssl generate for dev ([96c1561](https://github.com/pksep/chat_client/commit/96c156156dfd911053d34ae6c495145062405b06))
* Add unmount-contact emit to interfaces and handlers ([911f554](https://github.com/pksep/chat_client/commit/911f5545f84d7e04ba419f057aca41f75dd29812))
* Add unread message polling and fix various UI/styling issues ([bcd363c](https://github.com/pksep/chat_client/commit/bcd363cd78953c5d6d0f744d829ff8e047d59b77))
* Adjust mobile modal header title padding ([5197e67](https://github.com/pksep/chat_client/commit/5197e67dff8134c9afd13237be4cb235d4818802))
* Adjust mobile modal styles and fix button text labels ([2992477](https://github.com/pksep/chat_client/commit/2992477656b6cd34d2e12e7ea35d318f9173529c))
* ai assistant work ([60b8603](https://github.com/pksep/chat_client/commit/60b8603fec32bf71307a0b16a6245ca66e1a38c4))
* AI messages rendering and null checks ([4baf40a](https://github.com/pksep/chat_client/commit/4baf40a75c0516a80a000de666b3d0f4c0845555))
* auth by QR scaning ([f8985c5](https://github.com/pksep/chat_client/commit/f8985c518c3a01af569d2bf949a47d62e8fada8d))
* avatar-size with image ([26a5e59](https://github.com/pksep/chat_client/commit/26a5e59774e39eb5059cbe2e08d19333fb625308))
* background add header menu ([51597cc](https://github.com/pksep/chat_client/commit/51597ccbfd5e83a0b14f02fbc0d2ae32118c9c23))
* body overflow ([f4bb646](https://github.com/pksep/chat_client/commit/f4bb646ebcf16693618178b169dfe60c5ea2e6df))
* bugs of build sep-yui and change list ([5ccaffb](https://github.com/pksep/chat_client/commit/5ccaffb75f993d662489008f2e728da5dd03fa56))
* build on lib direcotry and fix error after ([f1f686e](https://github.com/pksep/chat_client/commit/f1f686ee464ea2e7a52ab2d78faa2c6e9e3fa9a9))
* build paths error ([647d44f](https://github.com/pksep/chat_client/commit/647d44f63d860397efe75328395d3f94813d29b8))
* bun lock ([6921aaa](https://github.com/pksep/chat_client/commit/6921aaa93b79449c4c2d284a5e435ac424e2536a))
* bun lock ([7f2d378](https://github.com/pksep/chat_client/commit/7f2d37819ecffc9805c1ec0395da64f85d6f9f82))
* bun lock error ([b1b0e8f](https://github.com/pksep/chat_client/commit/b1b0e8fcc5bc43ed1c9f3b30a4845a435a2504bc))
* change icon ([6150dfe](https://github.com/pksep/chat_client/commit/6150dfef14fae9d32b2cd722eb4a4dae75fa99f7))
* Change menu info buttons to 2-column grid on mobile ([7bad065](https://github.com/pksep/chat_client/commit/7bad0652b65445443e541415ea5d1ebbb25c2798))
* change namespace of sep-yui ([1e911af](https://github.com/pksep/chat_client/commit/1e911af0fdde3a1f8b0d70445acb8496971330eb))
* change to props and interface extends ([21a9403](https://github.com/pksep/chat_client/commit/21a9403be2e8a7958bd62137001bcd575504bcf3))
* chat sizes with mobile keyboard ([73952d7](https://github.com/pksep/chat_client/commit/73952d73697c99fdb4506cdd8cfbc044dd0b43bf))
* chat-container error ([7c5c232](https://github.com/pksep/chat_client/commit/7c5c2326d5553a3d719a50c321e9923bdd5449ed))
* checkUsers and contact remove from props ([7d593fe](https://github.com/pksep/chat_client/commit/7d593fec5037538da597751d3a7846b2cc0bfb16))
* Clean up CSS and fix mobile layout issues ([c43efac](https://github.com/pksep/chat_client/commit/c43eface26c50d554586ae97a9e3a2b1744c5463))
* Clean up formatting and remove debug log ([8841550](https://github.com/pksep/chat_client/commit/88415507eda42ec1a3db43b7f8ab3abb391f8fcf))
* Close MenuInfo on mobile and unify XL breakpoint ([7f08448](https://github.com/pksep/chat_client/commit/7f08448501395b7da8389971d70c7a70a39da5e5))
* closing modal ([66c7efb](https://github.com/pksep/chat_client/commit/66c7efb8948a2611782d507f45ddbfe5d016966c))
* collapse remove ([e097734](https://github.com/pksep/chat_client/commit/e097734ac8239feaa66a9caa173ddfc0882c4cba))
* config ([7e3377d](https://github.com/pksep/chat_client/commit/7e3377d81c31e81742d99818ea006cf7b03e580d))
* config ([583dcd2](https://github.com/pksep/chat_client/commit/583dcd26022ddfec045c4896673f25c031fa467d))
* config error path ([b1e2911](https://github.com/pksep/chat_client/commit/b1e2911b7616e7d8df8e05a36b8756706d815cf4))
* config openim ([11800ca](https://github.com/pksep/chat_client/commit/11800caa0670dc2d4e4a7df1dd12e82c37192ed3))
* contact update and message add ([86598e7](https://github.com/pksep/chat_client/commit/86598e764edd00991ef1469f94355c11723e607a))
* contact using one parameter ([9062535](https://github.com/pksep/chat_client/commit/906253514781ed5e7e022c260bdaed0007c936d3))
* containerfile ([704d0cb](https://github.com/pksep/chat_client/commit/704d0cb58ca432f110eb09895a5521bf4092519e))
* conversation not correct ([6f1a5fe](https://github.com/pksep/chat_client/commit/6f1a5feb4eaf7e495b19c4cb3480e06e07294efe))
* correct AI assistant message handling and indexing issues ([4280e16](https://github.com/pksep/chat_client/commit/4280e16b9a9cea3a28523f09a6e1f318f2d080e5))
* correct participant count when switching between groups ([d25f897](https://github.com/pksep/chat_client/commit/d25f89730284510d17006035236aaae6b0208675))
* Correct unmount-close event and append contacts ([f69b545](https://github.com/pksep/chat_client/commit/f69b545c5323b450312379a11624db77ada58a91))
* create a menu component and setup tauri ([e9ca4e7](https://github.com/pksep/chat_client/commit/e9ca4e7b9f7c8c291c5f88b09ef835473c6ec61b))
* create topic correct ([b7757f2](https://github.com/pksep/chat_client/commit/b7757f2880955aba7427617b5554151e63755557))
* data-divider errors ([8a3c260](https://github.com/pksep/chat_client/commit/8a3c2605ed31d8c5c7713bbb7762484d7cdf9078))
* data-testid wrote correct ([3ed0dc9](https://github.com/pksep/chat_client/commit/3ed0dc9ff9206b34dbb29aa71d9655b34f096b65))
* default-height ([25ebea5](https://github.com/pksep/chat_client/commit/25ebea575ae2340250627596f4edfcc41a5baf69))
* delete group ([be42092](https://github.com/pksep/chat_client/commit/be42092837ec46f4d6a25a1b0797ee81474b0e82))
* delete unused file ([ab1b19a](https://github.com/pksep/chat_client/commit/ab1b19acc1cc63191f51fe73f22636da5722e0ff))
* delete unused import ([0091eb2](https://github.com/pksep/chat_client/commit/0091eb222adc50646fe366b779beafd9df415ae4))
* disable self closing of component ([63c21a0](https://github.com/pksep/chat_client/commit/63c21a093eacbb71de42a6297e2ba6922c79bbe7))
* disable system audio ([5040228](https://github.com/pksep/chat_client/commit/5040228d070ff94eb10b25f888081567777004a8))
* doc chat core fix name ([d238445](https://github.com/pksep/chat_client/commit/d2384452ca0fb6fa0031151d9ab0aaa4b814f9de))
* dublicate requests ([f934bc1](https://github.com/pksep/chat_client/commit/f934bc12be24d33121308455e6d024da73b13ee8))
* duplicate error ([25b7d0a](https://github.com/pksep/chat_client/commit/25b7d0af85c7949639f62dbed2dd376f2b3e8fcd))
* ensure contacts is reset for non-group contacts in Header component ([d45f4b6](https://github.com/pksep/chat_client/commit/d45f4b64124c4215e959bec3697c7eeb4398649d))
* ensure messages appear immediately after sending ([b5331fe](https://github.com/pksep/chat_client/commit/b5331feff514a78d6777d9671288c1bf1e83026d))
* env names ([39a28c4](https://github.com/pksep/chat_client/commit/39a28c490f8a134381232c05081d71ee37096005))
* env.example ([9ffdfc5](https://github.com/pksep/chat_client/commit/9ffdfc54b6b7189793c9fe00cc014cf80f4d6625))
* error of blocks ([2dd284e](https://github.com/pksep/chat_client/commit/2dd284ea91f8acff6217ca71a876af285bcf042d))
* errors ([333da84](https://github.com/pksep/chat_client/commit/333da84ec2775ec4db30f409d610af47ef1937b0))
* errors ([a59a228](https://github.com/pksep/chat_client/commit/a59a228f5f6bb15466ae886cf2a77e0b258f806e))
* errors with lint ([2a87786](https://github.com/pksep/chat_client/commit/2a87786c47dd9902c6ad2f06a1c1bd6257e26c26))
* export interface ([44f8586](https://github.com/pksep/chat_client/commit/44f8586fe0a855c71c0c0d43dc53a0468e0cb530))
* Extract chat DB to useChatDb and add message types ([2cfcfac](https://github.com/pksep/chat_client/commit/2cfcfac5934cc40fe7177096aa4f97eb409fa491))
* fix: Introduce isReadByPeer and fix read state handling ([bdc5605](https://github.com/pksep/chat_client/commit/bdc560547a6b33c215e2963d9db30eeb766a4610))
* format parsing and .meta reps ai add ([82d204b](https://github.com/pksep/chat_client/commit/82d204bc49a8059d9e5587eed9916f6e96dba475))
* generate id ([31d5bac](https://github.com/pksep/chat_client/commit/31d5bacfa397b5de2649283f9f922f1e4dac0b34))
* getCurrent not using of window ([c52928e](https://github.com/pksep/chat_client/commit/c52928efe510364a5c74c8f5ebb27a37d9cc2222))
* group chat creation and message routing ([8022d39](https://github.com/pksep/chat_client/commit/8022d392a8973e07cfe6acc278e8c94d31fa986f))
* group member removal and improve group management ([b433e8a](https://github.com/pksep/chat_client/commit/b433e8a4f0ed135aff70f7048b5c85787fa22026))
* group members ([cbad22f](https://github.com/pksep/chat_client/commit/cbad22feb8a65433e466fc30e9825050a068b58d))
* groupList use Menu and update to avatar ([8bf00b4](https://github.com/pksep/chat_client/commit/8bf00b4a5b177e792a2a023af7367c9420262c54))
* groupo edit message ([67f71a1](https://github.com/pksep/chat_client/commit/67f71a1e66e4a1e33f5609549fb58615b3ce618b))
* Guard menu opening without contact; emit updates ([e80e6b6](https://github.com/pksep/chat_client/commit/e80e6b6e457d5556f0508f8cc3f09b0159050b25))
* header menu ([c4e5cef](https://github.com/pksep/chat_client/commit/c4e5cef6f6c03530358ab0ce9c08e6f11b7c5231))
* ilnt ([b84478a](https://github.com/pksep/chat_client/commit/b84478ad81bcd4a47446d44c7c56aeea3513927a))
* image sizes ([a799b30](https://github.com/pksep/chat_client/commit/a799b302687b2b1c5991150d28d87c5447f0d065))
* Improve route handling and null safety across chat components ([0b253ee](https://github.com/pksep/chat_client/commit/0b253eebdd776df9986560c4038400540d4498f9))
* IndexedDB timestamp serialization and Vue reactivity ([6125dfd](https://github.com/pksep/chat_client/commit/6125dfd02ea3fcca4d4ed1ae0bf20005d1d27e7f))
* infinite redirects ([5ccfc02](https://github.com/pksep/chat_client/commit/5ccfc02c88818dcdfcaf463a1e5e14c6b7030dce))
* interface ([f47a328](https://github.com/pksep/chat_client/commit/f47a328d614a3da84baff20e8333e70c8f68c812))
* invalid cache and build prod ([d327092](https://github.com/pksep/chat_client/commit/d327092b8581e4259bf14426e0a7c1dbc744fd5d))
* is-menu-iinfo only tag of header click ([1f5ba51](https://github.com/pksep/chat_client/commit/1f5ba5116f5690487a349975dc2371131a4216b6))
* keyboard setting ([a926e85](https://github.com/pksep/chat_client/commit/a926e85f8f88a9170a7facec015690b29d5ea5b9))
* layout and spacing issues in chat and mobile modal ([7a4c5de](https://github.com/pksep/chat_client/commit/7a4c5debac57d00a0f19d63e37ef79c36269519a))
* layout compared to figma ([c7b4409](https://github.com/pksep/chat_client/commit/c7b4409e560422996161434f4a056732975a421d))
* lefthook and ajv remove ([e8201b3](https://github.com/pksep/chat_client/commit/e8201b3390058e8159409fc0919f03e9f2c283b9))
* lexical errors ([1570c6c](https://github.com/pksep/chat_client/commit/1570c6c339a91051bd07020aacf22947da0b02c1))
* lint ([b9c2c92](https://github.com/pksep/chat_client/commit/b9c2c9243642962abf7ced9d36cf36f4b4ffd8a6))
* lint ([2266246](https://github.com/pksep/chat_client/commit/22662461fb6930d7d188aeb4fc87ddfb3bb41533))
* lint ([644f18c](https://github.com/pksep/chat_client/commit/644f18cf129a7845cecd1ac7fec284055f3f1b27))
* lint ([db9c25f](https://github.com/pksep/chat_client/commit/db9c25fde144e6dac0b98630a1de49e7cb8c5dc3))
* lint ([1406db4](https://github.com/pksep/chat_client/commit/1406db4ec36313c7401db22dff5c41a3f849a364))
* lint ([46078a5](https://github.com/pksep/chat_client/commit/46078a516075bd23b918fc9510b5c91632897e8c))
* lint ([0ffb7a1](https://github.com/pksep/chat_client/commit/0ffb7a1063263c72243d3314d3705c60c06ab12e))
* lint ([ed45084](https://github.com/pksep/chat_client/commit/ed45084e9eb12db13563e3e59d85f96fe3d44741))
* lint ([5d8dfaf](https://github.com/pksep/chat_client/commit/5d8dfaf23bbdd5eb09ca7158f217e56c43ff573b))
* lint ([c833cce](https://github.com/pksep/chat_client/commit/c833cced44cff977738bfc1295647d95c0debb55))
* lint ([ab5308b](https://github.com/pksep/chat_client/commit/ab5308b68f6240fa8f78ba1d874acd60c34db84f))
* lint ([b26824b](https://github.com/pksep/chat_client/commit/b26824b7ec800356c349edda5c2f7a67ebc7761b))
* lint ([3951fc9](https://github.com/pksep/chat_client/commit/3951fc979bdd3b885a6044f4bea40771cba1dd1b))
* lint ([00b1320](https://github.com/pksep/chat_client/commit/00b1320e4578ca1e626ae689b0135f3e65673f82))
* lint ([b8734df](https://github.com/pksep/chat_client/commit/b8734df276716170dccd3ad82f604d07144c289e))
* lint ([335469f](https://github.com/pksep/chat_client/commit/335469f865a5d3dd7647f228629ff2eb34b290f4))
* lint ([b76b707](https://github.com/pksep/chat_client/commit/b76b70792570cbcd6d785773d60ee9da92cb096f))
* lint ([da8b895](https://github.com/pksep/chat_client/commit/da8b89505165602d535b3a5e222e866003bd0ee4))
* lint ([d2f4a4b](https://github.com/pksep/chat_client/commit/d2f4a4b3cea09277f5e8ad27346969ce06b9a30a))
* lint ([26e3e17](https://github.com/pksep/chat_client/commit/26e3e17a1c6b9efb349adfc50fea0bd475081283))
* lint ([d3591c5](https://github.com/pksep/chat_client/commit/d3591c57e3663a8011cf175d9c876d8104d61c03))
* lint ([dc1ab5c](https://github.com/pksep/chat_client/commit/dc1ab5cc54ec30cd0aede6aa29148aa26d2c208a))
* lint ([16e3534](https://github.com/pksep/chat_client/commit/16e3534fb918468d939b33c9518df0a3b17b5683))
* lint ([9736ea2](https://github.com/pksep/chat_client/commit/9736ea2cd3d052b7b7539ae9bf052007e5e53560))
* lint ([65b75f4](https://github.com/pksep/chat_client/commit/65b75f413562c0ab988927fcad5191756903f254))
* lint ([4501df9](https://github.com/pksep/chat_client/commit/4501df968aa2c80e8bf96945593183c650c44b71))
* lint ([6fb0d2e](https://github.com/pksep/chat_client/commit/6fb0d2e612a5040ecb44b8b3205df8abd3d63d47))
* lint ([e4f81e0](https://github.com/pksep/chat_client/commit/e4f81e021943e3a91055186e1d6d85bad65c54df))
* lint ([297f0ad](https://github.com/pksep/chat_client/commit/297f0ade7ca470506b190a6bfc5c8572dfb2314f))
* lint error ([1e9318f](https://github.com/pksep/chat_client/commit/1e9318fc8d7d246d18d3a75aeda2af6e718b4c00))
* lint error check ([8713c85](https://github.com/pksep/chat_client/commit/8713c85f9bdda91bb04deb08a511900efb2076b9))
* lint errors ([8cd6e53](https://github.com/pksep/chat_client/commit/8cd6e5358db6158379cec4e79319a949d901846f))
* lint scripts ([a056c7f](https://github.com/pksep/chat_client/commit/a056c7fd7c15378701cfbab8c73d974f2c6fa231))
* **lint:** resolve ESLint errors in MessageList and useOpenIM ([0f33e7d](https://github.com/pksep/chat_client/commit/0f33e7d078bdcc95e99ed64df8242423b17676db))
* Mark messages as read on conversation switch ([aa46305](https://github.com/pksep/chat_client/commit/aa46305791dc375dcbac5eccce885ce7b46a5856))
* mastra is now sended messages ([2a29a54](https://github.com/pksep/chat_client/commit/2a29a540dbe3f03009ed14835838b1d071395207))
* menu info ([ec74050](https://github.com/pksep/chat_client/commit/ec74050a2d5df6bd62761a35bfab9f4a258e37a2))
* menu open of a minimal screens ([87b3e09](https://github.com/pksep/chat_client/commit/87b3e09667cb073451ed3783263877e9d3e1c092))
* merge conflicts ([520143c](https://github.com/pksep/chat_client/commit/520143c9af54c6e22e78c95c3a90ba9d4504e26e))
* merge errors ([5669f63](https://github.com/pksep/chat_client/commit/5669f6381c180d97633c842ed83b073d8d43a49a))
* message correctly load ([57e23ab](https://github.com/pksep/chat_client/commit/57e23abe2f3ff747be434bdd78c621384e2ed0b0))
* message loading ([996d68e](https://github.com/pksep/chat_client/commit/996d68e3c64374939a351150f765334e1ea70af7))
* message types ([f5e09e0](https://github.com/pksep/chat_client/commit/f5e09e099776f7bf92a8e0ee7e1142ae2d260262))
* messages ([2a9453d](https://github.com/pksep/chat_client/commit/2a9453dcc91cbdb63a5016e3c338c2d06a917a4c))
* **messages:** correct conversation ID construction for message loading ([587473d](https://github.com/pksep/chat_client/commit/587473d3228b0a4d2119970ffefc5639fb00e15a))
* mobile chat lists and responsive styling ([8c1b4c6](https://github.com/pksep/chat_client/commit/8c1b4c61bd627b4c12938b7f6db4f787c5457a42))
* mobile group creation and no-author spacing ([9c311cb](https://github.com/pksep/chat_client/commit/9c311cbf3021f6cb42ee1a0867c13392cfa6a5dc))
* mobile new contact to compute conversationId ([1305210](https://github.com/pksep/chat_client/commit/130521014c843e8cbff1430a77a219cff3d5b07a))
* **mobile:** correct back button navigation to appropriate category ([4e63b51](https://github.com/pksep/chat_client/commit/4e63b5101ca38dbb3fb3fe631dcc95d9eaaa629f))
* modal errors ([8472c26](https://github.com/pksep/chat_client/commit/8472c269e8744031d9128ba4a6c59b0ae5e0bfe9))
* modal wrapper support paddings correctly ([733b449](https://github.com/pksep/chat_client/commit/733b449ca8bed900b90ec27e5a919a5cda255370))
* Move loader inside topic list and add SDK polling in header ([8a0440c](https://github.com/pksep/chat_client/commit/8a0440c5e2f531360bb0086d6e4f65e929e1b0fa))
* name of package changed ([b64f83b](https://github.com/pksep/chat_client/commit/b64f83b97ba63666f2dd6ce2609b5cc096377b6d))
* name of packages and version update ([05b22ec](https://github.com/pksep/chat_client/commit/05b22ec89893b1295092520fd045b9626b02b723))
* new-group-modal styles and sheets ([ed83ae9](https://github.com/pksep/chat_client/commit/ed83ae98aa4a60a89c276da940b80a8071234daf))
* not need props chapter ([4d4a2dd](https://github.com/pksep/chat_client/commit/4d4a2dd145463a688471acd48d2d3aca7359cd66))
* onUnmount chat ([0ecf676](https://github.com/pksep/chat_client/commit/0ecf6768b006a6f80969d3020d898f9cece4fcfa))
* openim configuration and scroll effects ([be6484e](https://github.com/pksep/chat_client/commit/be6484e2ba3d0623046f3cbd13eb9cfaa0362584))
* openim error ([7eac42c](https://github.com/pksep/chat_client/commit/7eac42c7a5c88696eca313bf4e676d6806fb45f8))
* order correctly of menu items ([77afb54](https://github.com/pksep/chat_client/commit/77afb544991349261af5f6f106d0354a1d9687a8))
* package json ([dcc62e7](https://github.com/pksep/chat_client/commit/dcc62e767c78ef9a6f476fae8156bac271ce1099))
* packages for avatar ([d2c50c0](https://github.com/pksep/chat_client/commit/d2c50c0c18c6f3508fdbd5c4d50bf8f216bf9887))
* padding and center content ([3d7281a](https://github.com/pksep/chat_client/commit/3d7281a49062c62f0194145a5a28645365511479))
* padding styles of font-size ([ac4858b](https://github.com/pksep/chat_client/commit/ac4858be19540fb4bbdba5faf702b9096c5a7f04))
* personal messages display in menu by updating topic list state management ([63239c9](https://github.com/pksep/chat_client/commit/63239c937ad222a7c53969e10f01e4d181347339))
* platformIds for web ([338e2cc](https://github.com/pksep/chat_client/commit/338e2ccaed8feaba500a5072b307bc07daf95aa1))
* pnpm-lock ([2cda120](https://github.com/pksep/chat_client/commit/2cda1206ee84547f34eb662c1e9606c58d5c8b4c))
* polish chat styles: vars, hovers, media sizing ([a2fa889](https://github.com/pksep/chat_client/commit/a2fa889319898bf79e1384a697cc5737c146601a))
* Polish chat UI styles and menu interactions ([f0b363b](https://github.com/pksep/chat_client/commit/f0b363b83ca7aa224b1070eb169828ad28961b8a))
* process env don't work in a browser environment ([5215a9d](https://github.com/pksep/chat_client/commit/5215a9d991cdf625c14b7cd3bd41ef05a24a3d2c))
* props chapter dialogs ([8a0a997](https://github.com/pksep/chat_client/commit/8a0a997117c2da89c5fe476e56355129e038b4b7))
* pwa configs ([35c952c](https://github.com/pksep/chat_client/commit/35c952cfc30faab1e8a4039f7372e24041dbe9dd))
* pwa short name ([9566c07](https://github.com/pksep/chat_client/commit/9566c07e1d6c5cd389d528d7eaaba3ca47bf87d0))
* redirect and audio ([6382ed1](https://github.com/pksep/chat_client/commit/6382ed103beff4202097b4a9cd7473853f958436))
* Reduce avatar sizes; link local YUI package ([06d52e1](https://github.com/pksep/chat_client/commit/06d52e10c58d47efd5948370a5e4d80fc51a92e6))
* ref loading ([9cacd47](https://github.com/pksep/chat_client/commit/9cacd4791f3ae598203d0ebcccf718c7eff8477b))
* refacor ([73155ec](https://github.com/pksep/chat_client/commit/73155ec5aeb7861b5c9f555a036914274dde4a05))
* refactor ([8120a99](https://github.com/pksep/chat_client/commit/8120a99398c2a445f88ebd863bd389b4776d2662))
* refactor ([060f0b3](https://github.com/pksep/chat_client/commit/060f0b333102c68004d41ddc8ae7be9b0f5a965a))
* refactor ([4fc1beb](https://github.com/pksep/chat_client/commit/4fc1beb5a44194ce4a8055e983b6d6f9324ca214))
* refactor ([edd04a6](https://github.com/pksep/chat_client/commit/edd04a6871df6b4486a26d1c90fce98b9e01a498))
* refactor path system and package configs ([5c478a1](https://github.com/pksep/chat_client/commit/5c478a1ff579a36c9061c64faab24e848b70cee3))
* relax prop types and add class support for menus ([934c1b3](https://github.com/pksep/chat_client/commit/934c1b32f6477a9b92a4333c30dd40f3100b2b3c))
* remove cleanup ([4129f40](https://github.com/pksep/chat_client/commit/4129f4073ea6caa3dcdd69aff2dd2fd33ab1d871))
* remove comments ([2485c93](https://github.com/pksep/chat_client/commit/2485c93191b951d6bf44d1c5279112dc614fbc3d))
* Remove comments and clean up code style ([01b733f](https://github.com/pksep/chat_client/commit/01b733f8367a217905827f9bc4260f102390f887))
* remove comments from LLMs ([1c18bc9](https://github.com/pksep/chat_client/commit/1c18bc95c681471ce3867e66c98e89808feee228))
* Remove debug log from chapter watcher ([3bfe313](https://github.com/pksep/chat_client/commit/3bfe31369fae5b2634b3ea6f4d87add8a4009675))
* Remove debug log in MobileList ([1d85c71](https://github.com/pksep/chat_client/commit/1d85c719b9567eb320e8d14adf9918b3e0c4a143))
* remove doc file of techincal tz ([7482519](https://github.com/pksep/chat_client/commit/7482519a7c59e664ccd98d130246381063db8ee6))
* remove ERP_TOKEN from env ([c7a5229](https://github.com/pksep/chat_client/commit/c7a522960de18fa83418df85f4184215c7911863))
* remove pinia ([4343a66](https://github.com/pksep/chat_client/commit/4343a666fb077122c99785e9805381b007bdddcd))
* remove s3 but not working ([822fcc7](https://github.com/pksep/chat_client/commit/822fcc750415f5bd72575fdbe9921d12d012216e))
* remove tests ([b733e4d](https://github.com/pksep/chat_client/commit/b733e4d736bf733afabcbe24b8515cb944c9042f))
* Remove unused addLocalAIMessage function ([ea8425f](https://github.com/pksep/chat_client/commit/ea8425f23cd3892f75620c24862fb07e66aed695))
* Remove unused HeaderMenu props and simplify MenuInfo ([be95da4](https://github.com/pksep/chat_client/commit/be95da4ffff4ed6b78c4c5d73aa5e866e6dcd6f1))
* Remove unused system message styles Refactor system messages and ([67b3dd6](https://github.com/pksep/chat_client/commit/67b3dd6ff7ced655cc48767b553bef0e4eb6c438))
* remove warnings ([2e24ac6](https://github.com/pksep/chat_client/commit/2e24ac63475203862d7167e357526d45cb203495))
* reqi not used parsed ([b5f4973](https://github.com/pksep/chat_client/commit/b5f49739db1e2a2cfa70dec26e47a29246dca3d4))
* Reset group modal state on close ([6ced867](https://github.com/pksep/chat_client/commit/6ced867f01cb732f4652e99cdfbeb44d5afb68d8))
* resolve console errors and type safety issues ([66169b4](https://github.com/pksep/chat_client/commit/66169b45f316f6634d383884c699b974a6b6b439))
* resolve TypeScript and linting errors ([90fdf71](https://github.com/pksep/chat_client/commit/90fdf7153888f806e4095af5f5daeb63b2a8e353))
* resolve TypeScript errors and improve ChatSDK methods ([0bd338e](https://github.com/pksep/chat_client/commit/0bd338e49beb302b4f19402988ce9ecf8153eaf5))
* restore chat ([12fc311](https://github.com/pksep/chat_client/commit/12fc31110eb34cd76ab50105ddafcc1ca1f378a2))
* rule of popover ([d3806f2](https://github.com/pksep/chat_client/commit/d3806f24e893fa0fd9ea2f40bb56b9819e941fbc))
* scroll behavour and paddings of info ([33a8cd1](https://github.com/pksep/chat_client/commit/33a8cd175af2a517043f3a699303cdeb819bf620))
* scroll error ([d86d68b](https://github.com/pksep/chat_client/commit/d86d68b7bf389960333e045120c6e5c70f344a9d))
* scrolling ([92b88ca](https://github.com/pksep/chat_client/commit/92b88ca84b228e8aa80d1538ad83fa269de7e9e8))
* SDK path ([f97b230](https://github.com/pksep/chat_client/commit/f97b2306eefa39a730846c86e902c249db56958b))
* send audio ([ead91ee](https://github.com/pksep/chat_client/commit/ead91eecc97a97292071cf117d4d53d5dd653a40))
* sep-yui remove ([757bc6d](https://github.com/pksep/chat_client/commit/757bc6dbea173d7202c57a06a50aaab6fb17b9d4))
* sep-yui updated and color fix ([df7de8f](https://github.com/pksep/chat_client/commit/df7de8f581545a04cd80bef6f40c616a9fa1dac3))
* sep-yui version for local-package ([706874d](https://github.com/pksep/chat_client/commit/706874d6a5e7b0f645c5f02575ff17f20e0944ee))
* Separate system messages from date dividers ([f2639e5](https://github.com/pksep/chat_client/commit/f2639e50a3595766746d9f884d6ffccec974f6a0))
* show group image in header ([431876a](https://github.com/pksep/chat_client/commit/431876a22ad5dd050d2fb59e2c5832b847c4cba5))
* show messages ([3b43b20](https://github.com/pksep/chat_client/commit/3b43b2071ac5a41e34d98acdcae898993647c5fa))
* size and overflow fix ([62f4bdb](https://github.com/pksep/chat_client/commit/62f4bdb30d811c671f2367162c6d73ae56e4ced2))
* size and width of resize, block sizing ([299ce76](https://github.com/pksep/chat_client/commit/299ce7656ae334307241e931ea4bdc9d2b6b1049))
* size change to constant ([41bf76e](https://github.com/pksep/chat_client/commit/41bf76e5bcfdf2df2bfade1ac36792328fea1e94))
* size left menu info with size ([42654ec](https://github.com/pksep/chat_client/commit/42654ecbaa5e8d96df867bce2efe984ea8696060))
* size of push notification ([ff201f8](https://github.com/pksep/chat_client/commit/ff201f87bde3a64f6b25005c0f8c080377088573))
* size screen ([4ebb849](https://github.com/pksep/chat_client/commit/4ebb8495c170092f2851a175f21cdb8170fd8eeb))
* sizes of screenshots and title ([1f5f82e](https://github.com/pksep/chat_client/commit/1f5f82e40141d05eb0090c957980279414196dc5))
* socket reccnnect error ([df5f5d3](https://github.com/pksep/chat_client/commit/df5f5d3d4fff82becf334490c61c521ee0d02c8d))
* Standardize name to nickname across components ([30504e0](https://github.com/pksep/chat_client/commit/30504e0bf5f64d9b55b456ddf42033602ae2de3f))
* started refactor user-profile ([53fec9a](https://github.com/pksep/chat_client/commit/53fec9a44ff466584f9e08cd88fba62ed21d0fdc))
* styles ([0736e37](https://github.com/pksep/chat_client/commit/0736e37695002456dbaa91122b0808c56ed36861))
* support class props ([b2877b7](https://github.com/pksep/chat_client/commit/b2877b73249ab203c5446cf41db5bad8ea9b2f0a))
* support clear all database ([210c235](https://github.com/pksep/chat_client/commit/210c2358b32272a1f93915b5f33984b3a341378b))
* support public, and files to include of package ([210d254](https://github.com/pksep/chat_client/commit/210d254b24aaccd3a2f5a64e10b4afa9fe5cafe4))
* tabs and avatar poiner add ([62787c3](https://github.com/pksep/chat_client/commit/62787c3a594b5e095c10ee42fe776677cce82cc6))
* the comments and refactor ([3385851](https://github.com/pksep/chat_client/commit/3385851f2f06bf6dcef13fa666b7ca0baa68fa7c))
* timeout remove ([50fbae5](https://github.com/pksep/chat_client/commit/50fbae5535045bf5ac8ed0ab4b9b3b02cf451fb3))
* toggle menus via localstorage ([0953599](https://github.com/pksep/chat_client/commit/0953599e2564de85258a17c167809858b386021a))
* type and chapter errors ([62583fb](https://github.com/pksep/chat_client/commit/62583fbb80c8dbd489699372863f22848793af7e))
* type error ([430a7ff](https://github.com/pksep/chat_client/commit/430a7ff11550c435aca4f6441589456f91a28058))
* type error ([8694dca](https://github.com/pksep/chat_client/commit/8694dca96fc507e0b2fae40036a1475e98132c0a))
* type errors ([e3a99e4](https://github.com/pksep/chat_client/commit/e3a99e45cfb91c7cc16768cfcc463605e6ee6862))
* types ([bac801e](https://github.com/pksep/chat_client/commit/bac801e18c372bc6dbdf8cade21ebc6323e841ab))
* types and desktop test ([368cbb6](https://github.com/pksep/chat_client/commit/368cbb648530140bb7878c9c69d6f4dfe31198b0))
* types and style of selector ([b5dda45](https://github.com/pksep/chat_client/commit/b5dda455adbe0a8296ba6537fcee205c3d7af44f))
* types errors ([34b2add](https://github.com/pksep/chat_client/commit/34b2addffb526ae669baef5cd3fe38f892cb90b5))
* **types:** Add missing properties to interfaces and fix type errors ([972fcbe](https://github.com/pksep/chat_client/commit/972fcbed445f083ea9016d0618b091c0e962b0a2))
* unmount user add and more ([6a7a6f6](https://github.com/pksep/chat_client/commit/6a7a6f6e3fe482726105d56f815ffdfae8ce584c))
* unmount-contact ([9bacf9a](https://github.com/pksep/chat_client/commit/9bacf9aae6e85567efab26933906d41fec84ecff))
* unmount-contact handler binding ([e3a2b90](https://github.com/pksep/chat_client/commit/e3a2b90afe5d8a56984ec2427eefcc68a2f3a3f0))
* unuse clear data ([8c54cfd](https://github.com/pksep/chat_client/commit/8c54cfd4c2b5bdc70a5678d822a5b36adda236ae))
* update build and using peerDependencies for pksep ([bfa6089](https://github.com/pksep/chat_client/commit/bfa6089509c191d9a33a7100c40d126747b5395a))
* update process env to config store ([6d30c39](https://github.com/pksep/chat_client/commit/6d30c39fa2aeca018d70a440e936ced4e68a71ee))
* update sep-yui and authoriztion small fix ([55208a1](https://github.com/pksep/chat_client/commit/55208a19e6387d897b06b333f2217bc01b62e9e8))
* update to zod shared types ([dd93f60](https://github.com/pksep/chat_client/commit/dd93f600b52e3fc7f6589e47ec42f314ed53ad0d))
* update users after changes on MenuInfo ([bd1d201](https://github.com/pksep/chat_client/commit/bd1d20148453345339190b2c13e4bc766b558b1a))
* Use conversation ID for dialog navigation and read marking ([9fc38b6](https://github.com/pksep/chat_client/commit/9fc38b65ff25ee1de382f07d3a44ab45889f7b47))
* useMastra remove loading ([565eb76](https://github.com/pksep/chat_client/commit/565eb769fe2d04b6592858ee5cc3a7a9384b6154))
* user type ([c61e016](https://github.com/pksep/chat_client/commit/c61e0168f97824d0a334a232727eb45d9303b154))
* using requestAnimationFrame and fix scroll ([b610d0b](https://github.com/pksep/chat_client/commit/b610d0b248edb43c903142e49a2d9079a982da1f))
* version of app-vue ([4c85eb3](https://github.com/pksep/chat_client/commit/4c85eb39bb6ef594a4a8ec8fe37797b5e9935ab0))
* version of pksep ([c8336db](https://github.com/pksep/chat_client/commit/c8336db894c2b97a485ebb08da3d5c66be452c24))
* versions ([0bb2b25](https://github.com/pksep/chat_client/commit/0bb2b250b8d796ae8476965a2a364d2307fa3128))
* vite config for pwa ([63606a2](https://github.com/pksep/chat_client/commit/63606a27374ca5b5443ed3bf0eaeecda79ca630f))
* warning errors ([9e9f00f](https://github.com/pksep/chat_client/commit/9e9f00fe926c7d508750a70c515640e2c368b5fc))
* width not correct of mobile size ([745341e](https://github.com/pksep/chat_client/commit/745341e02416c38bcd249dba1a28fd60f55aceff))
* yui dependency and update MenuInfo component ([1ac09b4](https://github.com/pksep/chat_client/commit/1ac09b47d9514bbc4d800b15bd0a72c44c32615b))
* yui error ([b8beb76](https://github.com/pksep/chat_client/commit/b8beb762701f3942365ca191263617ba6c6d3ee1))
* исправил ошибку с установкой зависимостей для semantic version ([7816db2](https://github.com/pksep/chat_client/commit/7816db214b20fd79a8914b55d078e2d5aae6203b))
* сделал чтобы semantic-release игнорировал lefthook ([324f0c8](https://github.com/pksep/chat_client/commit/324f0c8e4c47bd0cc24d579240fa0221a37cd6a2))


### Features

*  get users with messages ([bf2aec6](https://github.com/pksep/chat_client/commit/bf2aec638015624c89f505228d13b5f52c8ee073))
* Add Android back button handling ([9de4ab0](https://github.com/pksep/chat_client/commit/9de4ab0172701fcfbcca8d0645730ef2d5211616))
* add auth logic ([a37b2c3](https://github.com/pksep/chat_client/commit/a37b2c3989e5f481cb5e156a7e7855fe8b4b78d2))
* add chat_sync ([e64b62a](https://github.com/pksep/chat_client/commit/e64b62a129e731ffd5b6df2e1617e6ba61c661d3))
* add commant for generating token ([d863ff7](https://github.com/pksep/chat_client/commit/d863ff7e41de4d3669de67d1824be0d118307f9e))
* Add consistent avatar sizing and mobile info modal styles ([e2d6481](https://github.com/pksep/chat_client/commit/e2d648166740244416bd98d26db1c8aa48557a86))
* add contact/group lookup by ID and remove debug logs ([5dad8e1](https://github.com/pksep/chat_client/commit/5dad8e146b4284be332c1c686dab5f8cc726689d))
* add Containerfile ([33edd86](https://github.com/pksep/chat_client/commit/33edd8616760971083ca8575a800547509629a5b))
* add currentTopic state for dialog header profile ([5ca4191](https://github.com/pksep/chat_client/commit/5ca41913eb9edac6e868b79901115ab1610bb9d2))
* add data-testid attributes to components for e2e testing ([a9f1251](https://github.com/pksep/chat_client/commit/a9f1251f245453eb5576a35dbee72dfd59c9a791))
* add data-testid attributes to core chat components ([3ffd7cc](https://github.com/pksep/chat_client/commit/3ffd7ccc2f850b620909246ff190d1d9a661b368))
* add date messages in chat ([cb93052](https://github.com/pksep/chat_client/commit/cb93052e08ff2e1787927d92ddb92e7ff42aa14a))
* add ex ([df193c2](https://github.com/pksep/chat_client/commit/df193c224259fc26b81d24c78dc32793859f6441))
* add example env variables to setup ([410c0cc](https://github.com/pksep/chat_client/commit/410c0ccec3614d6a04e43044c7ed2487242187db))
* Add group mute toggle and fetch group create date ([2779c3d](https://github.com/pksep/chat_client/commit/2779c3d7bb78b928e31fe866311b75659f3bbc3d))
* Add group support to chat container and contact list ([3331ff1](https://github.com/pksep/chat_client/commit/3331ff116e2e73eaecb1a06dfc0da193fc0efacd))
* add groupId ([07c999b](https://github.com/pksep/chat_client/commit/07c999baa07b5cd948da9e94c555f35a7cf61bb6))
* add loading states to all components in chat__nothing style ([3e9f3af](https://github.com/pksep/chat_client/commit/3e9f3af2e3de57af4769c47423d1f83c1b9af78f))
* add mediaSlider ([c6d9f95](https://github.com/pksep/chat_client/commit/c6d9f95a9b6c84390f0b905e97246140ea1249d5))
* add message status and audio ([a5b4608](https://github.com/pksep/chat_client/commit/a5b4608716f84ac1bf284b0a741b1d5dacdbb140))
* Add mobile info modal and refactor menu info components ([6702dd7](https://github.com/pksep/chat_client/commit/6702dd75ad0acb7376afb7e178f78fc81bba4b3a))
* add mobile pwa installation ([686c0f9](https://github.com/pksep/chat_client/commit/686c0f9dd9eee388121fea63505d609cdc16708a))
* add mobile responsive styles and fix menu info scrolling ([c0b87f4](https://github.com/pksep/chat_client/commit/c0b87f49605216c3cd7d63f05ceb69a70b2a184b))
* add mock users and ex logic ([eed649c](https://github.com/pksep/chat_client/commit/eed649c8678405962e5dd8e95849140ee998d25a))
* add mock users and ex logic ([79c7dbc](https://github.com/pksep/chat_client/commit/79c7dbca9bd710a91c12ebcc95a4f6bd7e048982))
* add new env ([d3c538b](https://github.com/pksep/chat_client/commit/d3c538bf5f2cfa0c3ff139eed859f0321e1241c3))
* add notification service ([69b95b9](https://github.com/pksep/chat_client/commit/69b95b9e6b55dfd8df70ff5b02774b46b9d7e0df))
* add qr scanner for android/ios/web ([c23bafb](https://github.com/pksep/chat_client/commit/c23bafb9c1e99fa82144f02cff5867f030c9a225))
* Add read indicators and label current user in list ([ae74a20](https://github.com/pksep/chat_client/commit/ae74a20f4a6b9be1934e0831e605ee76ee964177))
* add semantic ([c3ed9d0](https://github.com/pksep/chat_client/commit/c3ed9d020f1e523e16b9fc142348bd7ffbadd7f9))
* add sound in new message ([5877c7c](https://github.com/pksep/chat_client/commit/5877c7c66eb761c140369af6613bc403118bd62a))
* add topics ([bf682c9](https://github.com/pksep/chat_client/commit/bf682c9fdb37d805aa920087f121d457c8aa0094))
* add unmount-notification-count ([8fdfd68](https://github.com/pksep/chat_client/commit/8fdfd6828b0a6785f72450ccbda43a5730c97cd8))
* add updates topics ([eb9d8fa](https://github.com/pksep/chat_client/commit/eb9d8fad654cc9995975f3f20862c26d06b6cbf7))
* add upload file ([e4827c1](https://github.com/pksep/chat_client/commit/e4827c1e81c744e0510258f22dff470da49fb52f))
* add useUrlWatcher composable to watch URL changes and return topicId ([2f5110b](https://github.com/pksep/chat_client/commit/2f5110b25b7036698ae4d827a69e44012d85c2b9))
* add VITE_PATH_TO_FILE_CDN ([66573e0](https://github.com/pksep/chat_client/commit/66573e01fd9bdc821aa7156595f3639523051bc6))
* adjust new-group header border and tabs spacing ([36f9567](https://github.com/pksep/chat_client/commit/36f95670a17252b66eefb87b8800d1f53870612f))
* authorization of mobile with figma styles update ([89cbdc6](https://github.com/pksep/chat_client/commit/89cbdc69443d8043e0d91caa7c98c19864f6c0aa))
* avatarts and fix group messages ([c57dcac](https://github.com/pksep/chat_client/commit/c57dcacded691efcecddf6c4b946c5babfd38472))
* build in mobile device (ios, android) ([53f33fb](https://github.com/pksep/chat_client/commit/53f33fba67ae19dc501ec3e98087094c3f6fd07e))
* bun prepare use ([53049b7](https://github.com/pksep/chat_client/commit/53049b7d119816b1cb22449e40e3486e14e569ff))
* change contacts with support reactive update ([416ad17](https://github.com/pksep/chat_client/commit/416ad17480e3ae6b273f61ad22586e2385a5dd5a))
* change emits paramters ([591d788](https://github.com/pksep/chat_client/commit/591d788f72a6040479e8a5d92090db2df200126a))
* change RouteType of a enum ([f464b68](https://github.com/pksep/chat_client/commit/f464b681aef68af0c8b2df5f2d70bc9cebaa2098))
* change setTimeout and scroll behavour ([65cdf4b](https://github.com/pksep/chat_client/commit/65cdf4bb89fc4b43f547266a303ae13306783103))
* change user type ([c0f1c42](https://github.com/pksep/chat_client/commit/c0f1c42b5cb5d5fd716a529ec618412e43fe3a3e))
* chat-container format fix ([a517bec](https://github.com/pksep/chat_client/commit/a517beccfe32dcfcfc52996461f7f6ae005a6df4))
* **chat-sdk:** merge SDK files with parsed: false configuration ([e64a1f4](https://github.com/pksep/chat_client/commit/e64a1f45fc8dd714f772224fc9867e8de71bdb8b))
* **chat:** enhance message sending with improved contact resolution ([2700b75](https://github.com/pksep/chat_client/commit/2700b759cfc5cd5ae781207bac4bf397b343cfc8))
* chating ([87e4764](https://github.com/pksep/chat_client/commit/87e476454e31e3a570ae3d90131e9ea16d192ec9))
* **chat:** optimize performance and smoothen scrolling behavior ([16b2d6a](https://github.com/pksep/chat_client/commit/16b2d6a817bb6070d287374dbd1b16f9282c1312))
* chatting with media ([8805929](https://github.com/pksep/chat_client/commit/880592922d2b9de1d3b0355aae2bad99332441b6))
* close info when change convertation ([c213e9c](https://github.com/pksep/chat_client/commit/c213e9c5662c812785ea7c9a0bac35cdddfb5d9f))
* conditionally render MenuInfoButtons based on isMenuInfo prop ([0448699](https://github.com/pksep/chat_client/commit/04486990fb983fda09d6070097f413269edec561))
* create Containerfile ([0a36503](https://github.com/pksep/chat_client/commit/0a36503567a44a1919961bba7ce600e308e394b8))
* create group with image ([1f78907](https://github.com/pksep/chat_client/commit/1f789071896960f770bae4d56b4b7cdc439ac4cc))
* crud topics and refactor ([6165154](https://github.com/pksep/chat_client/commit/616515448e1f37854cce0076201f7c8599f9525a))
* delete about wasm ([ccef0a1](https://github.com/pksep/chat_client/commit/ccef0a11ac0263e67cb2710a217a265e25b07d6a))
* delete console ([03d85a6](https://github.com/pksep/chat_client/commit/03d85a62eebae26a25828ae3f24b59359e43e40b))
* Enable avatar upload/editing in information menu ([d69963d](https://github.com/pksep/chat_client/commit/d69963de9d6173540ecf95b468444658faa95b00))
* enable header popover and scope tab navigation styles ([4e1f861](https://github.com/pksep/chat_client/commit/4e1f8610990b05af3e635fcf533c38effc79cde3))
* Enable multi-select contacts and group invite flow ([a1b758a](https://github.com/pksep/chat_client/commit/a1b758a5e6cb1da821a87abf4ad72d5efbb9453c))
* example env and add import ([54fb97c](https://github.com/pksep/chat_client/commit/54fb97cad6319f592e681235687fe11ddfe15462))
* Exclude group members from add contact list ([6693c0e](https://github.com/pksep/chat_client/commit/6693c0e63f50dfcc9fe3d13f6624a1c1e62dba33))
* fix group and message problems ([a61c610](https://github.com/pksep/chat_client/commit/a61c61046d1d4449a1ced2c5a107108e5c72ef28))
* fix mobile version information ([03abda7](https://github.com/pksep/chat_client/commit/03abda72512915f08d3bbe6d9948d52ee7c5ed0a))
* fix topic updating logic ([dae3658](https://github.com/pksep/chat_client/commit/dae36586b66430fac46a49228fcb105c42123890))
* get messeges ([0e6210a](https://github.com/pksep/chat_client/commit/0e6210a76d48335afc5b37cf5bee0b34e2f65999))
* group logic ([a8fc967](https://github.com/pksep/chat_client/commit/a8fc967892e9524a6cb7ad41caf502d1ef63d3b8))
* guard message fetch and polish UI styles ([253d675](https://github.com/pksep/chat_client/commit/253d675965a84376218a735e14562a4c452254f5))
* Header disable not groupId and support notificationLabels ([392274e](https://github.com/pksep/chat_client/commit/392274efdba13bee1d94e65e2abfeb632cca791d))
* implement group and types ([e621e59](https://github.com/pksep/chat_client/commit/e621e591a80bb5253982b316f60d9744db291b97))
* import useGroup functions directly instead of via hook ([0de5c9b](https://github.com/pksep/chat_client/commit/0de5c9bc64953237706171fcd4224c2265161f63))
* Improve ContactList accessibility and mobile view ([49632f8](https://github.com/pksep/chat_client/commit/49632f89780a6f9596e62cad9f60f9972c8aeb41))
* Increase date divider margin-top to 15px ([0c267e9](https://github.com/pksep/chat_client/commit/0c267e9b9904f7fa85acae791ad204737f81edf2))
* increase limit count ([ace64d8](https://github.com/pksep/chat_client/commit/ace64d80a1836194095a8f7ef678160064c1bb26))
* Increase mobile breakpoint to 450px ([c652d68](https://github.com/pksep/chat_client/commit/c652d68dc5661a02700c57b8ebf20e85ddaaabb4))
* integrate chat auth logic ([01c8282](https://github.com/pksep/chat_client/commit/01c828265e25215d7b611e07c4c9a4488f5a83b9))
* ispin convertion logic ([154ca31](https://github.com/pksep/chat_client/commit/154ca310058523c6bb51213641ad46b05324c0c7))
* item remove ([6533a55](https://github.com/pksep/chat_client/commit/6533a556c8ae284201793862194d681077245ab5))
* login via erp token redirect ([938f3bf](https://github.com/pksep/chat_client/commit/938f3bf0b059a0618731dc782725201663ca1e0c))
* menu icon center ([4917c98](https://github.com/pksep/chat_client/commit/4917c98d5f72e9feb2e60c7e1f16b5631a9c0d01))
* **menu:** add direct routing calls to fix desktop navigation ([a1552e9](https://github.com/pksep/chat_client/commit/a1552e9f15105cad5f7350505b8b8cef31d4c185))
* message status icons new ([5537d9c](https://github.com/pksep/chat_client/commit/5537d9c77b387c5bd53590eb76b284ce78d750b6))
* migrate to chat sdk ([003f5f6](https://github.com/pksep/chat_client/commit/003f5f67213b5696293b1b3bec235e8a7e14e94a))
* mobile list generated ([6bc4770](https://github.com/pksep/chat_client/commit/6bc477072c4c456c6ccea4762f01747948d56330))
* move generating platform id to chat auth ([539cab9](https://github.com/pksep/chat_client/commit/539cab9dab1ac1995febfb75747251f4250feadc))
* new Chat wrote of container ([35c86fd](https://github.com/pksep/chat_client/commit/35c86fd7669f89180e7a73958a886dd09a68b6e4))
* new sep-yui and fix app ([0b86fb9](https://github.com/pksep/chat_client/commit/0b86fb9eebfb0ddf14a740a42d4dc97e7f377fe0))
* new topics and fucntions ([2a0aff6](https://github.com/pksep/chat_client/commit/2a0aff6ea5574dee3598e05912884d7770ab2d1a))
* notification parsing ([d4d3966](https://github.com/pksep/chat_client/commit/d4d3966d6ee207b575b6ee8d854eb8d94d5ab006))
* npmrc add in gitignore ([48f4b1f](https://github.com/pksep/chat_client/commit/48f4b1f77558ffc87627b3827868bcc5b7263ce5))
* openim configuration to a .meta folder ([beb3a8d](https://github.com/pksep/chat_client/commit/beb3a8d16a08b667e2a7c742b95ea61a7b71b8ce))
* pagination messages ([9dbea4f](https://github.com/pksep/chat_client/commit/9dbea4fa3695a1d643835a8172edfa7b2f36f293))
* refactor to packages architecture and support workspace ([1352a27](https://github.com/pksep/chat_client/commit/1352a274a8526e6bff694cbcb4cfd512dea95862))
* refactor useGroup to use currentGroup reactive state ([f8a803d](https://github.com/pksep/chat_client/commit/f8a803da891ce0c344b6fc3472b296bc413d6c72))
* refine chat background and contact list layout ([51410b0](https://github.com/pksep/chat_client/commit/51410b03f20ce04c025ed9313c0c0a6d751b3ee0))
* register logic and mock users ([fadc3ad](https://github.com/pksep/chat_client/commit/fadc3ad52cca3883594496fd6f1818383e4c3003))
* remove avatar with changed to avar from UI lib ([e1915bf](https://github.com/pksep/chat_client/commit/e1915bff227a5e0f0d494396f1929ce614fb87ac))
* remove openIm admin logic, set props only chat_auth service token ([b14095f](https://github.com/pksep/chat_client/commit/b14095fbdd77196f6b0add3d130ac39164a5a65f))
* remove user from group ([114a259](https://github.com/pksep/chat_client/commit/114a259102ef2267d1ea593d9428def7a801bfbb))
* removeMessanging loading function add ([9b50c42](https://github.com/pksep/chat_client/commit/9b50c42153a14a5fe3fa7d4138b374b53b0afbd2))
* sdk config ([e10b6fe](https://github.com/pksep/chat_client/commit/e10b6fed729c7b04bba36b4eb9742254a9f823d9))
* **sdk:** fix group updates on WebSocket events ([1ebf9e6](https://github.com/pksep/chat_client/commit/1ebf9e66e2c8703a83ae931b8424ad2dfb1217d1))
* simplify topic creation and clean up redundant comments ([fd2b352](https://github.com/pksep/chat_client/commit/fd2b35206d3f8b16f985ab916907523884ed3570))
* simplify watcher for groups and topics loading ([7c8f9e3](https://github.com/pksep/chat_client/commit/7c8f9e337cfd38b3af34d204d31f9c174ff67022))
* socket io make ([81d0585](https://github.com/pksep/chat_client/commit/81d0585b6e5ec84ec60ba7af5dfb95e7551f8fd2))
* start chating ([09394d1](https://github.com/pksep/chat_client/commit/09394d15bd7906fdab00834f2a07addabb4c24ed))
* start groups ([12c0b1d](https://github.com/pksep/chat_client/commit/12c0b1dac1bdc8aa2e6349f622219f64e7468d80))
* started a tauri chat ([8dd37c3](https://github.com/pksep/chat_client/commit/8dd37c39451fccc5b40e4996ce4dbbb30c64e74c))
* Streamline mobile new chat and fix button position ([c780b64](https://github.com/pksep/chat_client/commit/c780b64eb343e45472d23e904dd703c61698e93a))
* style fix and url import add ([baa08ac](https://github.com/pksep/chat_client/commit/baa08ac40380f655d05a2688a1543ec207688234))
* styles fixed after mobile merge ([8aa4bb1](https://github.com/pksep/chat_client/commit/8aa4bb1b64bba82dec561981e29a2eabe3417ebd))
* subscribeToEvent userUpdate ([d14de6e](https://github.com/pksep/chat_client/commit/d14de6e78f809a35f19e260ec52d8bf1ec57a9ae))
* Support avatarUrl and fix avatar save flow ([ffc1168](https://github.com/pksep/chat_client/commit/ffc11682c7826926808aea436fcf9c4944655b72))
* support contacts and new list of menu ([1d4ba82](https://github.com/pksep/chat_client/commit/1d4ba82b4ee4fe49e72a7c01874c0bf9ca1e4eda))
* support container sticky-heading ([3a7e333](https://github.com/pksep/chat_client/commit/3a7e333985d14d65cc9438c40885d5b8a0c8cc22))
* support cross-env ([b71e8b8](https://github.com/pksep/chat_client/commit/b71e8b807ae27f90e4c521113ab570a72f124d08))
* support localhost of openIM run ([b8ab694](https://github.com/pksep/chat_client/commit/b8ab694e44c7be96f2fe0b540b39d2a77566d152))
* Support media objects and improve media rendering ([92eaed9](https://github.com/pksep/chat_client/commit/92eaed9f7ee72cc4cc1469c13653214dd941049a))
* support modal of add new selector ([59e598d](https://github.com/pksep/chat_client/commit/59e598d97a0c740d42957d2b11e02508fd4f394a))
* support read of layouting and fix position ([64eac62](https://github.com/pksep/chat_client/commit/64eac6213cc9f3681266074c60ab52b6ea81add3))
* test ([0002467](https://github.com/pksep/chat_client/commit/0002467a7199f70136e0c85f44e732dd244a728a))
* tests and update tests of group ([8ae1a24](https://github.com/pksep/chat_client/commit/8ae1a245e4e303b8db57e317ed1cb93cfb736123))
* types any ([f126251](https://github.com/pksep/chat_client/commit/f1262515cf5aa82350cab8b5213fa316f8a3dfa5))
* Unify sticky header handling and fix add button ([609d7bc](https://github.com/pksep/chat_client/commit/609d7bc32127f724ec8bc9f324482903bb39c609))
* update contact components for multiple contacts ([ca5070b](https://github.com/pksep/chat_client/commit/ca5070be40259ddb9f2fb3176cfdd871c42eee0e))
* update lib and pnpm lock ([455d7a3](https://github.com/pksep/chat_client/commit/455d7a3e84b09efb68c828b8411ca107e652f6eb))
* update mobile list and contacts ([2a13283](https://github.com/pksep/chat_client/commit/2a13283da381119c4ab51524e3dd941cd95c209f))
* update pksep ([0d11f88](https://github.com/pksep/chat_client/commit/0d11f8805b3697720d63928ee990607aff1f80fb))
* update sep-yui and publish new version ([ba38e8d](https://github.com/pksep/chat_client/commit/ba38e8de88e5fbcb552601d3b62222048fdea1d6))
* update version ([0a4195d](https://github.com/pksep/chat_client/commit/0a4195d5ce3bb90dea3478020c8140f006ad7124))
* update VITE_OPENIM_WS_DOMAIN ([f0751df](https://github.com/pksep/chat_client/commit/f0751dfd8ffffd9134f900e4444ce2588c02c303))
* update ws config ([2e2dacc](https://github.com/pksep/chat_client/commit/2e2dacca116b654153513a157f6f6e540f32a591))
* update ws config ([54d4595](https://github.com/pksep/chat_client/commit/54d4595050c6046054f59c96dd4bfc7f72c0f1b4))
* upgrade group events ([3b1996c](https://github.com/pksep/chat_client/commit/3b1996c1cc2ea2c1727d12a7a75b2ed764366a95))
* uploading image or file ([d99d4bc](https://github.com/pksep/chat_client/commit/d99d4bc184869d15d209c8e7303bd553f1fc51d8))
* use users ([2e2362b](https://github.com/pksep/chat_client/commit/2e2362b9fdefeb6059c6ae70fee512d3baf3bf9f))
* useChat upload ([be0caf8](https://github.com/pksep/chat_client/commit/be0caf89b77c128082f4e9cfa803019ce78f5108))
* useConversation message ([f536f89](https://github.com/pksep/chat_client/commit/f536f89ff77355d52712204f7c58e1e7ae9cf89a))
* wire unmount-contact to contact message handler ([93c79e0](https://github.com/pksep/chat_client/commit/93c79e00dbfa6af2d28fc45d61bdff0b5a67a740))
* write a data-testid rule to llm ([5dae0ec](https://github.com/pksep/chat_client/commit/5dae0eccabf0823eb7595f6e834fcd6397e58fed))
* wrote new useChatSDK ([8c35a3c](https://github.com/pksep/chat_client/commit/8c35a3cf365fda5875bfc9fdedb862768151856d))
* wrote of init in tsx script ([c23c8b9](https://github.com/pksep/chat_client/commit/c23c8b919ec7ad310f33a74352c92ed69674604d))
* Добавил файлы конфигурации для semantic version ([79b3b21](https://github.com/pksep/chat_client/commit/79b3b216b8e4874815c973a3a2bd98c98da82f27))
* Убрал баг с названием файла конфигурации semantic version ([409052e](https://github.com/pksep/chat_client/commit/409052eacc1d96210741c3dae5ffaf6845cbf84b))

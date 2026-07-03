# [1.6.0](https://github.com/jacobbubu/md-to-lark/compare/v1.5.1...v1.6.0) (2026-07-03)

### Features

- support image display size resolver ([025a5c3](https://github.com/jacobbubu/md-to-lark/commit/025a5c39cfb12387068532792c910f6915983733))

## [1.5.1](https://github.com/jacobbubu/md-to-lark/compare/v1.5.0...v1.5.1) (2026-07-01)

### Bug Fixes

- preserve linked markdown images ([13bc9c4](https://github.com/jacobbubu/md-to-lark/commit/13bc9c4bc72c76bf4553f400081bb399e9dbd481))

# [1.5.0](https://github.com/jacobbubu/md-to-lark/compare/v1.4.11...v1.5.0) (2026-06-29)

### Features

- add opt-in single-dollar math parsing ([884d333](https://github.com/jacobbubu/md-to-lark/commit/884d33316d81d410e6268cef323273d4ef5d9a6b))

## [1.4.11](https://github.com/jacobbubu/md-to-lark/compare/v1.4.10...v1.4.11) (2026-06-23)

### Bug Fixes

- preserve blockquote inline marks ([#55](https://github.com/jacobbubu/md-to-lark/issues/55)) ([f991849](https://github.com/jacobbubu/md-to-lark/commit/f991849c026bbf56920d792c9b78489f4ebf5c65))

## [1.4.10](https://github.com/jacobbubu/md-to-lark/compare/v1.4.9...v1.4.10) (2026-06-13)

### Bug Fixes

- preserve valid cjk bold spans during normalization ([#54](https://github.com/jacobbubu/md-to-lark/issues/54)) ([b8a51d2](https://github.com/jacobbubu/md-to-lark/commit/b8a51d2833b3d8ad63c66f232751334b6e830c15))

## [1.4.9](https://github.com/jacobbubu/md-to-lark/compare/v1.4.8...v1.4.9) (2026-06-13)

### Bug Fixes

- prevent chained bold normalization mismatches ([#50](https://github.com/jacobbubu/md-to-lark/issues/50)) ([2f325a8](https://github.com/jacobbubu/md-to-lark/commit/2f325a8b12711c69878a02afe181c3c5cf2a35e6))

## [1.4.8](https://github.com/jacobbubu/md-to-lark/compare/v1.4.7...v1.4.8) (2026-06-13)

### Bug Fixes

- normalize bold adjacent to chinese text ([#48](https://github.com/jacobbubu/md-to-lark/issues/48)) ([01168c2](https://github.com/jacobbubu/md-to-lark/commit/01168c21119f943dd33cdfab30ebac4de339339a))

## [1.4.7](https://github.com/jacobbubu/md-to-lark/compare/v1.4.6...v1.4.7) (2026-06-13)

### Bug Fixes

- avoid bold normalization false positives ([#47](https://github.com/jacobbubu/md-to-lark/issues/47)) ([ab82c82](https://github.com/jacobbubu/md-to-lark/commit/ab82c82ff8ec8e6977b5dad9a55b73e3ddcea23f))

## [1.4.6](https://github.com/jacobbubu/md-to-lark/compare/v1.4.5...v1.4.6) (2026-06-13)

### Bug Fixes

- normalize chinese bold punctuation before parse ([#46](https://github.com/jacobbubu/md-to-lark/issues/46)) ([1551b89](https://github.com/jacobbubu/md-to-lark/commit/1551b891171fc12e231405f26ad09bbde3e62656))

## [1.4.5](https://github.com/jacobbubu/md-to-lark/compare/v1.4.4...v1.4.5) (2026-06-13)

### Bug Fixes

- disable single-dollar math parsing by default ([#44](https://github.com/jacobbubu/md-to-lark/issues/44)) ([0b27534](https://github.com/jacobbubu/md-to-lark/commit/0b275344328ee2578334cc02fb5e08562763cef5))

## [1.4.4](https://github.com/jacobbubu/md-to-lark/compare/v1.4.3...v1.4.4) (2026-04-14)

### Bug Fixes

- ignore fragment links in attachment transform ([#41](https://github.com/jacobbubu/md-to-lark/issues/41)) ([f33f3ca](https://github.com/jacobbubu/md-to-lark/commit/f33f3ca42beb29c32696526522194650ed06b925))

## [1.4.3](https://github.com/jacobbubu/md-to-lark/compare/v1.4.2...v1.4.3) (2026-04-03)

### Bug Fixes

- scale image height from target width ([#40](https://github.com/jacobbubu/md-to-lark/issues/40)) ([2c65321](https://github.com/jacobbubu/md-to-lark/commit/2c65321539cbd4f679faf36d20d81493110a1e53))

## [1.4.2](https://github.com/jacobbubu/md-to-lark/compare/v1.4.1...v1.4.2) (2026-04-03)

### Bug Fixes

- stop semantic-release success from resolving gitlab issues ([#39](https://github.com/jacobbubu/md-to-lark/issues/39)) ([6ca8038](https://github.com/jacobbubu/md-to-lark/commit/6ca80381b3a1c07639c6f9c62657a298c4bac735))

## [1.4.1](https://github.com/jacobbubu/md-to-lark/compare/v1.4.0...v1.4.1) (2026-04-03)

### Bug Fixes

- preserve image width on Feishu upload ([#36](https://github.com/jacobbubu/md-to-lark/issues/36)) ([e982e26](https://github.com/jacobbubu/md-to-lark/commit/e982e260fa408d91cfeaf160493382ee2431fad7))

# [1.4.0](https://github.com/jacobbubu/md-to-lark/compare/v1.3.1...v1.4.0) (2026-03-30)

### Features

- support resource base dir override ([#35](https://github.com/jacobbubu/md-to-lark/issues/35)) ([9d6dbcf](https://github.com/jacobbubu/md-to-lark/commit/9d6dbcfeab24bbbbe2b103ee02d72246afca82b5))

## [1.3.1](https://github.com/jacobbubu/md-to-lark/compare/v1.3.0...v1.3.1) (2026-03-28)

### Bug Fixes

- correct Feishu code block language mappings ([#33](https://github.com/jacobbubu/md-to-lark/issues/33)) ([#6](https://github.com/jacobbubu/md-to-lark/issues/6)) ([6599216](https://github.com/jacobbubu/md-to-lark/commit/6599216ee3bc9e26e868980487927bbb72fd56b1))

# [1.3.0](https://github.com/jacobbubu/md-to-lark/compare/v1.2.0...v1.3.0) (2026-03-28)

### Features

- support ordered preset chains ([#28](https://github.com/jacobbubu/md-to-lark/issues/28)) ([c0217f9](https://github.com/jacobbubu/md-to-lark/commit/c0217f990376b318e583c874cb26faa47322f93e))

# [1.2.0](https://github.com/jacobbubu/md-to-lark/compare/v1.1.0...v1.2.0) (2026-03-27)

### Features

- support document base url config ([#24](https://github.com/jacobbubu/md-to-lark/issues/24)) ([b578de6](https://github.com/jacobbubu/md-to-lark/commit/b578de603a8367fd39b4ea582636bf37855930da))

# [1.1.0](https://github.com/jacobbubu/md-to-lark/compare/v1.0.0...v1.1.0) (2026-03-27)

### Features

- structure cli publish output ([#23](https://github.com/jacobbubu/md-to-lark/issues/23)) ([f0a1dee](https://github.com/jacobbubu/md-to-lark/commit/f0a1deecd3f8159aaac5964bcee1974f297b598e))

# 1.0.0 (2026-03-27)

### Bug Fixes

- provide NODE_AUTH_TOKEN for release ([#22](https://github.com/jacobbubu/md-to-lark/issues/22)) ([6079308](https://github.com/jacobbubu/md-to-lark/commit/607930893e00a839bb8bd8b48e850a6147557a29))

### Features

- add zh smart quotes preset ([#1](https://github.com/jacobbubu/md-to-lark/issues/1)) ([afedbc2](https://github.com/jacobbubu/md-to-lark/commit/afedbc23ee93ccea632328081c83d852cbf3a27e))
- replace chinese preset with md-zh-format ([#11](https://github.com/jacobbubu/md-to-lark/issues/11)) ([0a2fca4](https://github.com/jacobbubu/md-to-lark/commit/0a2fca4818654ca8fed0abebefdeef281e3c3a58))

# Changelog

This file is managed by semantic-release.

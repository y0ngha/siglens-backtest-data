# 리플레이 실행 결과 Release 자산 목록

2026-11-21~22 리플레이 실행 결과(WP-15·16·19, variance 실험 raw)는 git blob이 아니라 GitHub Release 자산으로 보관한다. 로컬 폴더는 그대로 두고, 저장소에서는 `.gitignore`로 추적에서 제외한다.

- Release 태그: `replay-runs-2026-11-22`
- Release URL: https://github.com/y0ngha/siglens-backtest-data/releases/tag/replay-runs-2026-11-22
- 자산 규칙: 실행 폴더 1개당 `tar.gz` 1개 (variance-p34는 `raw/` 하위만 별도 아카이브)

## 자산 목록

| 자산 파일명 | 크기(bytes) | sha256 | 원본 경로 (`replay-sets/v1/runs/` 기준) |
|---|---:|---|---|
| 2026-11-21-variance-p34-raw.tar.gz | 52414075 | faab1ef91a07d41e28fe9fdf259fe104db401778f0107e9f3dd6f80c277f2e7a | 2026-11-21-variance-p34/raw/ |
| 2026-11-22-wp15-c16-after.tar.gz | 5746844 | f599aa257f186fbcba57b2a0bfe3814b0268359930b92fb61318a0f6c43a48ab | 2026-11-22-wp15-c16-after/ |
| 2026-11-22-wp15-c16-before.tar.gz | 3918037 | 3398f3728632db5bb0239db3898d557fb54a038816857cd225b35702c5753cbf | 2026-11-22-wp15-c16-before/ |
| 2026-11-22-wp15-c2-after.tar.gz | 27560498 | a300b7d43f5d32f3d8ebdb80334d6485f5dc7b9f4aa3826a11568a030d711d58 | 2026-11-22-wp15-c2-after/ |
| 2026-11-22-wp15-c2-after2.tar.gz | 27728696 | 40956e6f84352eb5ea363150c8243d3a4a96d737f719d0f1043bf49e2b3b88c1 | 2026-11-22-wp15-c2-after2/ |
| 2026-11-22-wp15-c2-after3.tar.gz | 27711021 | b6e7caabd3bc8d7a1c80260ab2d44cc0814488fbd475bfd55850a7051fa0cf56 | 2026-11-22-wp15-c2-after3/ |
| 2026-11-22-wp15-c2-before.tar.gz | 27143848 | 8ad1c3941643bdc77951735708cd7107b2eefdf4238f81bc4238132d0d7da6de | 2026-11-22-wp15-c2-before/ |
| 2026-11-22-wp16-after-f.tar.gz | 4735750 | 795c295a4739bec73ea6f1db4091cb4343b1967e1ec63e1af4d9e47dfa680958 | 2026-11-22-wp16-after-f/ |
| 2026-11-22-wp16-after-m.tar.gz | 23123887 | 293a2dc98ec89599ef8d0ccd0f243e28299527ce5207e874c5d08a86def2fbf9 | 2026-11-22-wp16-after-m/ |
| 2026-11-22-wp16-before-f.tar.gz | 5726235 | 7eab6daa4967427c59660ef9fce394ab8e9a5761f799bc05432ee69b06f50427 | 2026-11-22-wp16-before-f/ |
| 2026-11-22-wp16-before-m.tar.gz | 27618083 | a061dc29037365b6547cc0ff070635e46e67a473a42597a2ecbf4aebeac9762b | 2026-11-22-wp16-before-m/ |
| 2026-11-22-wp16-repeat-f.tar.gz | 5725559 | 5d0c235bd3b550eebca950557b29dd65713a45e79d94bd114c6f3ce77f4714ed | 2026-11-22-wp16-repeat-f/ |
| 2026-11-22-wp16-repeat-m.tar.gz | 6590028 | e524594df7ff2232cbf52470722ea2fedc36c6ce7cc3bcf8737214e14456e0cc | 2026-11-22-wp16-repeat-m/ |
| 2026-11-22-wp19-core0-htf-1Day-50951dda.tar.gz | 96893 | 31900a8ba52604ca7df5c224e5900a987f0620bba6eb0da62022afe25dc53cfe | 2026-11-22-wp19-core0-htf-1Day-50951dda/ |
| 2026-11-22-wp19-core0-htf-forward.tar.gz | 12074 | b53094e60d076ea019e80538f524b49bf9b018edda17995bb3767c0d15a67c8c | 2026-11-22-wp19-core0-htf-forward/ |

## 복원 방법

Release 자산을 받은 뒤 `replay-sets/v1/runs/` 디렉터리에서 풀면 원래 폴더 구조가 복원된다. 변형 실험 raw는 `2026-11-21-variance-p34/` 폴더 안에서 푼다.

```bash
cd replay-sets/v1/runs
gh release download replay-runs-2026-11-22 -R y0ngha/siglens-backtest-data -p '2026-11-22-wp15-c2-after.tar.gz'
tar -xzf 2026-11-22-wp15-c2-after.tar.gz

mkdir -p 2026-11-21-variance-p34
gh release download replay-runs-2026-11-22 -R y0ngha/siglens-backtest-data -p '2026-11-21-variance-p34-raw.tar.gz' -D 2026-11-21-variance-p34
tar -xzf 2026-11-21-variance-p34/2026-11-21-variance-p34-raw.tar.gz -C 2026-11-21-variance-p34
```

무결성 확인은 `shasum -a 256 <파일명>.tar.gz`로 위 표의 sha256과 대조한다.

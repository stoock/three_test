# 거제동 골목길 산책 (Geoje-dong Alley Walk)

부산 연제구 거제동 여고로14번길 거리뷰 영상을 참조해 Three.js로 재현한
1인칭 걷기 씬입니다. 학교 옹벽 골목을 직접 걸어볼 수 있습니다.

## 실행 방법

ES 모듈을 사용하므로 로컬 서버로 실행하세요.

```powershell
powershell -File serve.ps1        # http://localhost:8000
```

python/node가 있다면 `python -m http.server 8000` / `npx serve .` 도 가능합니다.

## 조작법

| 키 | 동작 |
|---|---|
| `W` `A` `S` `D` | 이동 |
| 마우스 | 시점 회전 |
| `Shift` | 달리기 |
| `ESC` | 일시정지 |

## 구간

1. 학교 모퉁이 — 횡단보도, 어린이보호구역
2. 상가 골목 — 수학학원·부동산 간판
3. 주택 골목 — 석축 담장과 주차 차량
4. 종점 — 공사장 굴착기, 어린이집, 체크 타일 입구

## 기술

- Three.js r160 (vendor 동봉, 빌드 도구 없음)
- 프로시저럴 캔버스 텍스처 + 참조 영상에서 추출한 간판 텍스처
- 참조 영상: `video/Screenshot 2026-06-10 at 22.00.03.webm`

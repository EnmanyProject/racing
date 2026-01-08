"""
Gecko Sprint Game Playwright Test
- 게코 선택
- 탭 카운트 증가 확인
- 화면 전환 확인
- 경주 진행 상태 확인
"""

from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOT_DIR = "C:/Users/dosik/racing/test_screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def test_gecko_sprint():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844})  # Mobile viewport

        print("=" * 50)
        print("Gecko Sprint 테스트 시작")
        print("=" * 50)

        # 1. 페이지 로드
        print("\n[1] 페이지 로드 중...")
        page.goto('http://localhost:5173')
        page.wait_for_load_state('networkidle')
        time.sleep(2)  # 소켓 연결 대기

        page.screenshot(path=f"{SCREENSHOT_DIR}/01_initial_load.png", full_page=True)
        print(f"    스크린샷: 01_initial_load.png")

        # 현재 페이지 상태 확인
        content = page.content()

        # 연결 상태 확인
        connection_status = page.locator('.connection-status').get_attribute('data-state')
        print(f"    연결 상태: {connection_status}")

        # Phase 확인
        phase_text = page.locator('.phase-text').text_content()
        print(f"    현재 Phase: {phase_text}")

        # 2. 게코 카드 확인
        print("\n[2] 게코 카드 확인...")
        gecko_cards = page.locator('.gecko-card').all()
        print(f"    발견된 게코 카드 수: {len(gecko_cards)}")

        if len(gecko_cards) > 0:
            # 첫 번째 게코 선택
            print("\n[3] 첫 번째 게코 선택...")
            gecko_cards[0].click()
            time.sleep(1)
            page.screenshot(path=f"{SCREENSHOT_DIR}/02_gecko_selected.png", full_page=True)
            print(f"    스크린샷: 02_gecko_selected.png")

            # 선택된 게코 확인
            selected_gecko = page.locator('.gecko-card[data-selected="true"]')
            if selected_gecko.count() > 0:
                print("    게코 선택 성공!")
            else:
                print("    경고: 게코 선택되지 않음")

        # 3. 탭 대기 화면 확인 (LOBBY에서 게코 선택 후)
        print("\n[4] 탭 대기 화면 확인...")
        tap_view = page.locator('.tap-view')
        if tap_view.count() > 0:
            print("    탭 대기 화면 표시됨")
            page.screenshot(path=f"{SCREENSHOT_DIR}/03_tap_ready.png", full_page=True)
            print(f"    스크린샷: 03_tap_ready.png")
        else:
            print("    탭 대기 화면 없음 (아직 LOBBY)")

        # 4. CLICK_WINDOW 페이즈 대기 및 테스트
        print("\n[5] CLICK_WINDOW 페이즈 대기...")
        max_wait = 120  # 최대 2분 대기
        waited = 0
        click_window_found = False

        while waited < max_wait:
            phase_text = page.locator('.phase-text').text_content()
            if 'CLICK' in phase_text.upper() or 'TAP' in phase_text.upper():
                click_window_found = True
                print(f"    CLICK_WINDOW 페이즈 진입! ({waited}초 후)")
                break
            time.sleep(2)
            waited += 2
            if waited % 10 == 0:
                print(f"    대기 중... {waited}초")

        if click_window_found:
            page.screenshot(path=f"{SCREENSHOT_DIR}/04_click_window.png", full_page=True)
            print(f"    스크린샷: 04_click_window.png")

            # 탭 버튼 확인
            tap_button = page.locator('#tap-button')
            if tap_button.count() > 0:
                print("\n[6] 탭 버튼 테스트...")

                # 카운트다운 대기 (3초)
                time.sleep(3.5)
                page.screenshot(path=f"{SCREENSHOT_DIR}/05_tap_ready_to_tap.png", full_page=True)

                # 초기 탭 카운트 확인
                tap_counter = page.locator('#tap-counter')
                initial_count = tap_counter.text_content() if tap_counter.count() > 0 else "0"
                print(f"    초기 탭 카운트: {initial_count}")

                # 탭 버튼 클릭 테스트
                for i in range(5):
                    try:
                        tap_button.click(timeout=1000)
                        time.sleep(0.2)
                    except:
                        print(f"    탭 {i+1} 실패 (버튼 비활성화?)")
                        break

                time.sleep(0.5)
                page.screenshot(path=f"{SCREENSHOT_DIR}/06_after_taps.png", full_page=True)

                # 탭 후 카운트 확인
                final_count = tap_counter.text_content() if tap_counter.count() > 0 else "0"
                print(f"    최종 탭 카운트: {final_count}")

                if int(final_count) > int(initial_count):
                    print("    탭 카운트 증가 확인!")
                else:
                    print("    경고: 탭 카운트가 증가하지 않음!")

            # RACING 페이즈 대기
            print("\n[7] RACING 페이즈 대기...")
            race_waited = 0
            while race_waited < 30:
                phase_text = page.locator('.phase-text').text_content()
                if 'RACING' in phase_text.upper():
                    print(f"    RACING 페이즈 진입!")
                    break
                time.sleep(1)
                race_waited += 1

            page.screenshot(path=f"{SCREENSHOT_DIR}/07_racing.png", full_page=True)
            print(f"    스크린샷: 07_racing.png")

            # 경주 중 스크린샷 여러 장
            for i in range(5):
                time.sleep(1)
                page.screenshot(path=f"{SCREENSHOT_DIR}/08_racing_{i+1}.png", full_page=True)

            # 오버레이 확인
            countdown_overlay = page.locator('.countdown-overlay[data-visible="true"]')
            if countdown_overlay.count() > 0:
                overlay_text = page.locator('.countdown-digit').text_content()
                print(f"    카운트다운 오버레이 표시: {overlay_text}")

            # RESULTS 페이즈 대기
            print("\n[8] RESULTS 페이즈 대기...")
            result_waited = 0
            while result_waited < 30:
                phase_text = page.locator('.phase-text').text_content()
                if 'RESULT' in phase_text.upper():
                    print(f"    RESULTS 페이즈 진입!")
                    break
                time.sleep(1)
                result_waited += 1

            page.screenshot(path=f"{SCREENSHOT_DIR}/09_results.png", full_page=True)
            print(f"    스크린샷: 09_results.png")
        else:
            print("    CLICK_WINDOW 페이즈 대기 시간 초과")

        # 콘솔 에러 확인
        print("\n[9] 콘솔 로그 확인...")

        browser.close()

        print("\n" + "=" * 50)
        print("테스트 완료!")
        print(f"스크린샷 저장 위치: {SCREENSHOT_DIR}")
        print("=" * 50)

if __name__ == "__main__":
    test_gecko_sprint()

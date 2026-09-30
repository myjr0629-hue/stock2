// ============================================================================
// 앱의 첫 화면 컨트롤러 — Capacitor 기본(CAPBridgeViewController)에 «앱 안 플러그인» 등록만 더한다.
// Main.storyboard 의 customClass 가 이 클래스다(customModule App).
// 앱 타깃 안의 플러그인은 npm 플러그인과 달리 packageClassList 로 자동 등록되지 않는다(cap sync 가 그 목록을 덮어쓴다).
// ============================================================================

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}

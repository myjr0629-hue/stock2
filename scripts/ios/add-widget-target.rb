#!/usr/bin/env ruby
# ============================================================================
# «내 종목» 홈 화면 위젯 타깃(SignumWidget)을 ios/App/App.xcodeproj 에 더한다 — 여러 번 돌려도 같은 결과(멱등).
#   ruby scripts/ios/add-widget-target.rb
# 하는 일:
#   ① 위젯 확장 타깃 SignumWidget (com.signumhq.app.SignumWidget · iOS 15 · App Group 엔타이틀먼트)
#   ② 소스·리소스: ios/App/SignumWidget/*, 공용 ios/App/Shared/WidgetShared.swift(앱·위젯 둘 다)
#   ③ 앱 타깃: WidgetBridgePlugin.swift · MainViewController.swift · 위젯 의존 + «Embed Foundation Extensions»
#   ④ 위젯 버전(MARKETING_VERSION·CURRENT_PROJECT_VERSION)을 앱과 같게 — 다르면 업로드가 거절된다(ITMS-90473)
# 설계서: .agent/product/WIDGET-PLAN-2026-09-29.md
# ============================================================================
require 'xcodeproj'

ROOT = File.expand_path('../..', __dir__)
PROJECT_PATH = File.join(ROOT, 'ios/App/App.xcodeproj')
WIDGET = 'SignumWidget'
WIDGET_BUNDLE_ID = 'com.signumhq.app.SignumWidget'
TEAM = '25RG9GSHHZ'

project = Xcodeproj::Project.open(PROJECT_PATH)
app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')

def find_or_new_group(parent, name, path)
  parent.children.find { |c| c.isa == 'PBXGroup' && (c.name == name || c.path == path) } || parent.new_group(name, path)
end

def ensure_file(group, path)
  group.files.find { |f| f.path == path } || group.new_reference(path)
end

def ensure_in_phase(phase, file_ref)
  return if phase.files_references.include?(file_ref)
  phase.add_file_reference(file_ref, true)
end

# ── ① 타깃 ─────────────────────────────────────────────────────────────
widget = project.targets.find { |t| t.name == WIDGET }
unless widget
  widget = project.new_target(:app_extension, WIDGET, :ios, '15.0', project.products_group, :swift)
  puts "created target #{WIDGET}"
end

app_version = app.build_configurations.first.build_settings['MARKETING_VERSION']
app_build = app.build_configurations.first.build_settings['CURRENT_PROJECT_VERSION']

widget.build_configurations.each do |cfg|
  s = cfg.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = WIDGET_BUNDLE_ID
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = "#{WIDGET}/Info.plist"
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGN_ENTITLEMENTS'] = "#{WIDGET}/#{WIDGET}.entitlements"
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = TEAM
  s['MARKETING_VERSION'] = app_version
  s['CURRENT_PROJECT_VERSION'] = app_build
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['SKIP_INSTALL'] = 'YES'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = 'AccentColor'
  s['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = cfg.name == 'Debug' ? 'DEBUG' : ''
  s.delete('INFOPLIST_KEY_CFBundleDisplayName')
end

# ── ② 파일 ─────────────────────────────────────────────────────────────
main = project.main_group
wgroup = find_or_new_group(main, WIDGET, WIDGET)
shared = find_or_new_group(main, 'Shared', 'Shared')
app_group = main.children.find { |c| c.isa == 'PBXGroup' && c.path == 'App' } or abort('App group not found')

widget_sources = %w[WatchlistWidget.swift WidgetViews.swift WidgetData.swift Logos.swift].map { |f| ensure_file(wgroup, f) }
ensure_file(wgroup, 'Info.plist')
ensure_file(wgroup, "#{WIDGET}.entitlements")
assets = ensure_file(wgroup, 'Assets.xcassets')

strings = wgroup.children.find { |c| c.isa == 'PBXVariantGroup' && c.name == 'Localizable.strings' }
unless strings
  strings = project.new(Xcodeproj::Project::Object::PBXVariantGroup)
  strings.name = 'Localizable.strings'
  strings.source_tree = '<group>'
  wgroup.children << strings
end
%w[en ko ja].each do |lang|
  path = "#{lang}.lproj/Localizable.strings"
  next if strings.children.any? { |c| c.path == path }
  ref = project.new(Xcodeproj::Project::Object::PBXFileReference)
  ref.name = lang
  ref.path = path
  ref.source_tree = '<group>'
  ref.last_known_file_type = 'text.plist.strings'
  strings.children << ref
end

# 애플 «이유가 필요한 API»(UserDefaults · App Group) 신고 — 앱·위젯 각자 번들에 들어가야 한다(ITMS-91053)
app_privacy = ensure_file(app_group, 'PrivacyInfo.xcprivacy')
widget_privacy = ensure_file(wgroup, 'PrivacyInfo.xcprivacy')
ensure_in_phase(app.resources_build_phase, app_privacy)
ensure_in_phase(widget.resources_build_phase, widget_privacy)

shared_swift = ensure_file(shared, 'WidgetShared.swift')
plugin_swift = ensure_file(app_group, 'WidgetBridgePlugin.swift')
vc_swift = ensure_file(app_group, 'MainViewController.swift')

widget_sources.each { |f| ensure_in_phase(widget.source_build_phase, f) }
ensure_in_phase(widget.source_build_phase, shared_swift)
ensure_in_phase(widget.resources_build_phase, assets)
ensure_in_phase(widget.resources_build_phase, strings)

ensure_in_phase(app.source_build_phase, shared_swift)
ensure_in_phase(app.source_build_phase, plugin_swift)
ensure_in_phase(app.source_build_phase, vc_swift)

# 시스템 프레임워크 — Xcode 위젯 템플릿과 같게 WidgetKit·SwiftUI 만, SDK 버전에 묶이지 않는 SDKROOT 경로로.
# (xcodeproj 의 add_system_framework 는 «iPhoneOS26.0.sdk» 같은 버전 경로를 박는다 → 다른 Xcode 에서 깨진다)
fw_phase = widget.frameworks_build_phase
fw_phase.files.dup.each do |bf|
  ref = bf.file_ref
  next unless ref && ref.path.to_s.include?('.sdk/')
  fw_phase.remove_build_file(bf)
  ref.remove_from_project if ref.referrers.empty? || ref.referrers.all? { |r| !r.is_a?(Xcodeproj::Project::Object::PBXBuildFile) }
end
frameworks_group = main.children.find { |c| c.isa == 'PBXGroup' && c.name == 'Frameworks' } || main.new_group('Frameworks')
frameworks_group.children.select { |c| c.isa == 'PBXGroup' && c.children.empty? }.each(&:remove_from_project)
%w[WidgetKit SwiftUI].each do |fw|
  path = "System/Library/Frameworks/#{fw}.framework"
  ref = frameworks_group.files.find { |f| f.path == path }
  unless ref
    ref = frameworks_group.new_reference(path)
    ref.name = "#{fw}.framework"
    ref.source_tree = 'SDKROOT'
    ref.last_known_file_type = 'wrapper.framework'
  end
  fw_phase.add_file_reference(ref, true) unless fw_phase.files_references.include?(ref)
end

# ── ③ 앱에 심기 ────────────────────────────────────────────────────────
app.add_dependency(widget) unless app.dependencies.any? { |d| d.target == widget }

embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' }
unless embed
  embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.dst_subfolder_spec = '13'   # PlugIns
  embed.dst_path = ''
end
unless embed.files_references.include?(widget.product_reference)
  bf = embed.add_file_reference(widget.product_reference, true)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

# 타깃 속성(Xcode 가 자동 서명 UI 를 그리는 데 쓴다)
attrs = project.root_object.attributes['TargetAttributes'] ||= {}
attrs[widget.uuid] ||= {}
attrs[widget.uuid]['CreatedOnToolsVersion'] ||= '26.0'
attrs[widget.uuid]['ProvisioningStyle'] = 'Automatic'
attrs[widget.uuid]['DevelopmentTeam'] = TEAM

project.save
puts "ok — #{WIDGET} v#{app_version}(#{app_build}) · sources #{widget.source_build_phase.files.count} · app sources #{app.source_build_phase.files.count}"

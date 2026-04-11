const fs = require('fs');

const path = 'src/components/LiveTickerDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    "import DualGaugeHUD from '@/components/ui/DualGaugeHUD';",
    "import DualGaugeHUD from '@/components/ui/DualGaugeHUD';\nimport { useMobile } from '@/hooks/useMobile';\nimport { MobileCommandHeader } from '@/components/mobile/MobileCommandHeader';\nimport { MobileSnapCarousel } from '@/components/mobile/MobileSnapCarousel';\nimport { MobileBottomSheet } from '@/components/mobile/MobileBottomSheet';"
);

content = content.replace(
    "const tCommon = useTranslations('common');",
    "const tCommon = useTranslations('common');\n    const isMobile = useMobile();"
);

content = content.replace("<TechnicalLevelsMap", "<TechnicalLevelsMap isMobile={isMobile}");
content = content.replace("<GammaPressureGauge", "<GammaPressureGauge isMobile={isMobile}");

fs.writeFileSync(path, content, 'utf8');
console.log("Added useMobile successfully.");

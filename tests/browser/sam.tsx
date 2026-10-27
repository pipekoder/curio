import { createRoot } from 'react-dom/client'
import LivingAdvertisement from '../../src/LivingAdvertisement'
import { catalog, catalogItem } from '../../shared/catalog'
import '../../src/styles.css'
const ad = catalogItem.parse({ ...catalog[0], image: { ...catalog[0].image, id: 'test-sam-preview-v1', path: '/catalog/operator-preview.png', role: 'supplied_image' }, licensing: { status: 'cleared', rightsHolder: 'Test fixture only', evidence: 'docs/TEST_ONLY.md' }, permissions: { ...catalog[0].permissions, aiAnalysis: { status: new URLSearchParams(location.search).has('blocked') ? 'blocked' : 'approved', evidence: new URLSearchParams(location.search).has('blocked') ? null : 'docs/TEST_ONLY.md' } } })
const samResult = { adId: ad.id, assetId: ad.image.id, width: 1200, height: 900, model: 'sam-3.1', source: 'sam_detection', regions: [{ id: 'sam-2', detailId: 'home-lamp-detail', box: { x: 560/1200, y: 170/900, width: 400/1200, height: 320/900 }, confidence: null, uncertainty: 'model_estimate_not_identity' }] }
createRoot(document.getElementById('root')!).render(<main style={{maxWidth:800,margin:'0 auto',padding:20}}><h1>MOCK SAM RESULT REPLAY</h1><p>Automated renderer fixture. No genuine model inference or real permission grant is claimed. This harness is excluded from the production build.</p><LivingAdvertisement ad={ad} eager samResult={samResult}/></main>)

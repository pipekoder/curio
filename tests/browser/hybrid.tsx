import { createRoot } from 'react-dom/client'
import CatalogImage from '../../src/CatalogImage'
import Attribution from '../../src/Attribution'
import { validateCatalog } from '../../shared/catalog'
import { externalFixture, testExternalApprovals } from '../hybrid-fixtures'
import '../../src/styles.css'
const [ad] = validateCatalog([externalFixture], {}, testExternalApprovals)
const approved = !location.search.includes('unapproved')
createRoot(document.getElementById('root')!).render(<main className="page"><h1>Test-only hybrid media</h1><CatalogImage ad={ad} externalApprovals={approved ? testExternalApprovals : {}} /><Attribution ad={ad} externalApprovals={approved ? testExternalApprovals : {}} /></main>)

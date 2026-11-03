// @vitest-environment node
import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'

// wrangler.jsonc is the source of truth for non-secret Worker vars: every
// deploy uploads these values, overwriting same-name Dashboard entries. This
// guard keeps Production flags, preparation limits, budgets, models, and
// bindings pinned so a deploy can never silently reset them.
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8')) as {vars:Record<string,string>;d1_databases:{binding:string;database_id:string}[];r2_buckets:{binding:string;bucket_name:string}[]}

it('keeps every approved feature flag enabled',()=>{
  for(const flag of ['MAGAZINE_AI_ENABLED','LEGACY_MAGAZINE_AI_ENABLED','EDITORIAL_REVIEW_ENABLED','EDITORIAL_PUBLIC_AI_ENABLED','EDITORIAL_KNOWLEDGE_V2_ENABLED','EDITORIAL_HYBRID_ENABLED','EDITORIAL_ARTICLES_ENABLED','EDITORIAL_ARTICLE_PREPARATION_ENABLED','CULTURAL_INTELLIGENCE_V3_ENABLED','CULTURAL_RESEARCH_PLANNER_ENABLED','CULTURAL_RELATIONSHIP_AI_ENABLED','CULTURAL_LONGFORM_ENABLED','ASSET_AI_ENABLED','SAM_DECODER_ENABLED'])
    expect(config.vars[flag],flag).toBe('true')
})

it('pins the owner-authorized Wonder provider attestation for Hybrid availability',()=>{
  // Owner-authorized Hybrid configuration: changing this value asserts an
  // explicit owner decision. This pins the approved setting; it does not
  // assert a live paid Wonder call has succeeded. Owner-only follow-up.
  expect(config.vars.EDITORIAL_WONDER_PROVIDER_VERIFIED).toBe('true')
})

it('pins the article preparation limits',()=>{
  expect(config.vars).toMatchObject({ARTICLE_PREP_MAX_PER_HOUR:'24',ARTICLE_PREP_MAX_PER_DAY:'48',ARTICLE_PREP_WINDOW_LIMIT:'4',ARTICLE_PREP_WINDOW_SECONDS:'16',ARTICLE_PREP_CONCURRENCY:'4'})
})

it('pins the Demo Testing window, Demo budget caps, and Article Chief timeout',()=>{
  expect(config.vars).toMatchObject({DEMO_TESTING_MODE:'true',DEMO_TESTING_WINDOW_SECONDS:'900',DEMO_TESTING_WINDOW_UNITS:'12',EDITORIAL_DEMO_BUDGET_ENABLED:'true',EDITORIAL_DEMO_DAILY_UNITS:'160',EDITORIAL_DEMO_LIFETIME_UNITS:'500',ARTICLE_CHIEF_TIMEOUT_MS:'60000'})
})

it('preserves budgets, models, and bindings',()=>{
  expect(config.vars).toMatchObject({INFERENCE_DAILY_MAX_UNITS:'100',MAGAZINE_MAX_CALLS:'100',META_WONDER_MODEL:'muse-wonder-1.0',META_SPARK_MODEL:'muse-spark-1.3',CATALOG_OPERATOR_ENABLED:'true',CATALOG_PUBLIC_ENABLED:'true'})
  expect(config.d1_databases).toEqual([{binding:'CATALOG_DB',database_name:'curio-catalog',database_id:'b39c4f63-74ee-47f6-bb1d-7388ecc88bc7',migrations_dir:'migrations'}])
  expect(config.r2_buckets).toEqual([{binding:'MEDIA_BUCKET',bucket_name:'curio-media'}])
})

it('keeps secrets out of the committed config',()=>{
  for(const key of Object.keys(config.vars))expect(key,'no secrets in git').not.toMatch(/TOKEN|SECRET|API_KEY|SALT/)
})

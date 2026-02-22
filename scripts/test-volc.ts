import { volcRequest } from '../lib/volcengine'

async function main() {
  const r = await volcRequest('CVSync2AsyncSubmitTask', { 
    req_key: 'jimeng_high_aes_general_v21_L20', 
    prompt: 'test', 
    width: 1080, 
    height: 1920, 
    return_url: true 
  })
  console.log(JSON.stringify(r).slice(0, 300))
}

main().catch(e => console.error(String(e).slice(0, 400)))

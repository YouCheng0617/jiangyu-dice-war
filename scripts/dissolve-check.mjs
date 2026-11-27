// 驗證房主解散後，房間的保留訊息被清掉，新客人加不進去
import { Net } from '../lib/net.js';
const host = new Net({ token: 'dh-' + Date.now(), onState() {} });
const { code } = await host.host('甲');
await new Promise((r) => setTimeout(r, 800));
host.close({ dissolve: true });
await new Promise((r) => setTimeout(r, 1500));
const g = new Net({ token: 'dg-' + Date.now(), onState() {} });
console.log('after dissolve join ->', JSON.stringify(await g.join(code, '乙')));
g.close();
setTimeout(() => process.exit(0), 300);

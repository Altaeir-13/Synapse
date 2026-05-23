import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('kimi', false);
  const page = getActivePage('kimi');
  
  if (page) {
    await page.goto('https://www.kimi.com/');
    console.log('Navigated to Kimi.');
    
    const dbs = await page.evaluate(async () => {
        const dbList = await indexedDB.databases();
        return dbList;
    });
    console.log('Databases:', dbs);
    
    // Try to find token in all DBs
    const token = await page.evaluate(async (dbs) => {
        function getStoreKeys(dbName, storeName) {
            return new Promise((resolve) => {
                const req = indexedDB.open(dbName);
                req.onsuccess = (e) => {
                    const db = e.target.result;
                    try {
                        const tx = db.transaction(storeName, 'readonly');
                        const store = tx.objectStore(storeName);
                        const allReq = store.getAll();
                        const keysReq = store.getAllKeys();
                        allReq.onsuccess = () => {
                            keysReq.onsuccess = () => {
                                const res = {};
                                keysReq.result.forEach((k, i) => res[k] = allReq.result[i]);
                                resolve(res);
                            };
                        };
                    } catch(e) {
                        resolve({});
                    }
                };
                req.onerror = () => resolve({});
            });
        }
        
        let allData = {};
        for (const db of dbs) {
            // we don't know store names easily, but commonly 'keyvaluepairs' for localforage
            allData[db.name] = await getStoreKeys(db.name, 'keyvaluepairs');
        }
        return allData;
    }, dbs);
    
    console.log('Token data:', JSON.stringify(token, null, 2).substring(0, 500));
  }

  await closePlaywright('kimi');
}

main();

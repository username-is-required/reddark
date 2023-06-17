// this file originally based on https://github.com/Osekai/osekai-imagepier/blob/main/request.js
// since rewritten to use axios

const axios = require('axios');

module.exports = {
    httpsGet: function (url) {
        return new Promise(async (resolve, reject) => {
            try {
                const resp = await axios.get(url, {
                    baseURL: "https://www.reddit.com",
                    headers: {
                        // "Range": "bytes=0-50",
                        "User-Agent": "Reddark (https://github.com/username-is-required/Reddark)"
                    },
                    timeout: 30000 // 30s timeout
                });
            } catch (err) {
                reject(err);
            }
        });
        
        return new Promise((resolve, reject) => {
            


            const request = https.get(options, (res) => {
                if (res.statusCode < 200 || res.statusCode > 299) {
                    //return reject(new Error(`HTTP status code ${res.statusCode}`))
                }

                const body = []
                res.on('data', (chunk) => body.push(chunk))
                res.on('end', () => {
                    const resString = Buffer.concat(body).toString()
                    resolve(resString)
                })
            })

            request.on('error', (err) => {
                reject(err)
            });
            request.on('timeout', () => {
                request.destroy()
                reject(new Error('timed out'))
            });

            request.end();
        })
    }
}

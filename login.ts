import { chromium } from 'playwright';

async function login() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://www.amazon.ca/ap/signin?openid.pape.max_auth_age=900&openid.return_to=https%3A%2F%2Fwww.amazon.ca%2Fgp%2Fyourstore%2Fhome%3Fpath%3D%252Fgp%252Fyourstore%252Fhome%26signIn%3D1%26useRedirectOnSuccess%3D1%26action%3Dsign-out%26ref_%3Dnav_AccountFlyout_signout&openid.assoc_handle=caflex&openid.mode=checkid_setup&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0');

    console.log('login, it will close automatically when done.');

    await page.waitForSelector('#nav-link-accountList', {
        timeout: 180000 // 3 minutes
    });

    console.log('successfully logged in, saving session...');

    await context.storageState({ path: 'amazon.json' });

    console.log('session saved to amazon.json');
    await browser.close();
}

login();

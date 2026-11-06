const $ = selector => document.querySelector(selector);
const runId = crypto.randomUUID();
const started = performance.now();
const observed = [];
let running = false;
let connected = false;
let networkEvents = [];
let version = '';
let receiptStatus = 'idle';

function log(message) {
  $('#log').textContent += `${((performance.now() - started) / 1000).toFixed(2)}s  ${message}\n`;
}
function render() {
  $('#cart').textContent = observed.filter(e => e.type === 'cart-sell').length;
  $('#product').textContent = observed.filter(e => e.type === 'product-sell').length;
  $('#network').textContent = networkEvents.filter(e => ['cart-sell', 'product-sell'].includes(e.type)).length;
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Chargement impossible : ${src}`));
    document.head.append(script);
  });
}
window.dataLayer = window.dataLayer || [];
window.joinStories = {
  owner: 'qa-gtm-checkout',
  analyticsUrl: `${location.origin}/collect/${runId}`,
  consentConfig: { method: 'default' },
};
window.addEventListener('error', event => log(`Erreur navigateur : ${event.message}`));
document.addEventListener('JOIN_ANALYTICS_READY', () => log('JOIN_ANALYTICS_READY reçu.'));
document.addEventListener('JOIN_ANALYTICS', event => {
  const data = event.detail;
  if (!['cart-sell', 'product-sell'].includes(data?.event_type)) return;
  observed.push({ type: data.event_type, transaction: data.transaction_id });
  log(`${data.event_type} · transaction ${data.transaction_id}`);
  const carts = observed.filter(e => e.type === 'cart-sell').length;
  const products = observed.filter(e => e.type === 'product-sell').length;
  if (receiptStatus === 'pending') $('#verdict').textContent = carts === 1 && products === 1
    ? `Un cart-sell et un product-sell observés${version === 'direct' ? ' en appel direct, sans validation du modèle GTM' : ' via le parcours GTM'}. Vérification HTTP en cours.`
    : 'Événements de vente supplémentaires observés. Vérifier un éventuel double déclenchement.';
  if (receiptStatus === 'received' && (carts > 1 || products > 1)) $('#verdict').textContent = 'Événements de vente supplémentaires observés après réception HTTP. Vérifier un éventuel double déclenchement.';
  render();
});
const consoleLog = console.log.bind(console);
console.log = (...args) => {
  consoleLog(...args);
  if (typeof args[0] === 'string' && /\[(Success|Failed)\] Join Stories - Checkout Tracking Code/.test(args[0])) log(args[0]);
};

async function connect(id) {
  if (!/^GTM-[A-Z0-9]+$/.test(id)) throw new Error('Identifiant GTM invalide.');
  $('#connect button').disabled = true;
  $('#connection').textContent = 'Chargement du vrai conteneur GTM…';
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  try {
    await loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`);
    connected = true;
    sessionStorage.setItem('qa-gtm-container', id);
    $('#connection').textContent = `${id} chargé. Les deux balises de test doivent être configurées dans ce conteneur.`;
    $('#original').disabled = false;
    $('#fixed').disabled = false;
    log(`Conteneur natif ${id} chargé.`);
  } catch (error) {
    $('#connection').textContent = error.message;
    $('#connect button').disabled = false;
  }
}
$('#connect').addEventListener('submit', event => {
  event.preventDefault();
  connect($('#gtm').value.trim().toUpperCase()).catch(error => log(error.message));
});
const params = new URLSearchParams(location.search);
const container = params.get('gtm') ?? sessionStorage.getItem('qa-gtm-container');
if (container) { $('#gtm').value = container; connect(container).catch(error => log(error.message)); }
$('#reset').addEventListener('click', () => location.reload());

async function run(model) {
  if (running || (model !== 'direct' && !connected)) return;
  running = true;
  version = model;
  receiptStatus = 'pending';
  const scenario = $('#scenario').value;
  for (const selector of ['#original', '#fixed', '#direct', '#scenario', '#gtm', '#connect button']) $(selector).disabled = true;
  log(`Essai ${runId} · ${model} · ${scenario}`);
  $('#verdict').textContent = 'Achat fictif en cours. Aucun paiement.';
  try {
    if (model === 'direct' || scenario === 'ready') await loadScript('/global.js');
    if (model !== 'direct' && scenario === 'controller') {
      await loadScript('/controller.js');
      log(`Contrôleur présent : ${typeof window.JoinStories?.sendCartValidated}. Analytics prêtes : ${Boolean(window.joinStories?.globalScript?.loaded)}.`);
    }
    const item = { item_id: 'qa-product', item_name: 'Produit de test', price: 29, quantity: 1, currency: 'EUR' };
    if (model === 'direct') {
      setTimeout(() => window.JoinStories.sendCartValidated({ transaction_id: runId, total_base_amount: 29, total_final_amount: 29, currency: 'EUR', products: [{ product_id: item.item_id, product_price: 29, product_base_price: 29, product_final_price: 29, product_quantity: 1, currency: 'EUR' }] }), 1000);
      log('Appel direct à JOIN programmé dans une seconde. Aucun modèle GTM exécuté par ce bouton.');
    } else {
      const event = `qa_checkout_${model}`;
      window.dataLayer.push({ event, ecommerce: { transaction_id: runId, value: 29, currency: 'EUR', items: [item] } });
      log(`${event} envoyé au dataLayer. Vérifier le statut de la balise dans Tag Assistant.`);
      if (['delayed', 'controller'].includes(scenario)) {
        setTimeout(() => loadScript('/global.js').then(() => log('Global script chargé après le checkout.')).catch(error => log(error.message)), 1000);
      }
    }
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/received/${runId}`);
        if (!response.ok) throw new Error(`Collecteur HTTP indisponible (${response.status}).`);
        const events = await response.json();
        if (receiptStatus !== 'pending') return;
        networkEvents = events;
        render();
        const sales = networkEvents.filter(e => ['cart-sell', 'product-sell'].includes(e.type));
        if (sales.length >= 2) {
          receiptStatus = 'received';
          const carts = sales.filter(e => e.type === 'cart-sell');
          const products = sales.filter(e => e.type === 'product-sell');
          $('#verdict').textContent = carts.length === 1 && products.length === 1 && carts[0].transaction === products[0].transaction
            ? `Un cart-sell et un product-sell reçus par le serveur HTTP local${model === 'direct' ? ' en diagnostic direct, sans GTM' : ''}. Même transaction.`
            : 'Les événements HTTP ne correspondent pas à une vente unique. Consulter le journal.';
          log(`Collecteur HTTP : ${sales.map(e => e.type).join(', ')}.`);
          clearInterval(timer);
        }
      } catch (error) {
        if (receiptStatus !== 'pending') return;
        receiptStatus = 'failed';
        $('#verdict').textContent = 'Validation HTTP incomplète : le collecteur local est indisponible.';
        log(error.message);
        clearInterval(timer);
      }
    }, 500);
    setTimeout(() => {
      clearInterval(timer);
      if (receiptStatus !== 'pending') return;
      receiptStatus = 'timed-out';
      if (!observed.length) {
        $('#verdict').textContent = 'Aucune vente observée avant la fin du délai de 16 secondes. Contrôler la balise dans Tag Assistant ; cela ne prouve pas à lui seul que le modèle a été exécuté.';
      } else if (networkEvents.filter(e => ['cart-sell', 'product-sell'].includes(e.type)).length < 2) {
        $('#verdict').textContent = 'Validation HTTP incomplète : événements JOIN observés, mais réception par le serveur non confirmée après 16 secondes.';
      }
    }, 16000);
  } catch (error) { $('#verdict').textContent = error.message; log(error.message); }
}
$('#original').addEventListener('click', () => run('original'));
$('#fixed').addEventListener('click', () => run('fixed'));
$('#direct').addEventListener('click', () => run('direct'));
log('Page prête. Aucun modèle GTM simulé. Aucun eval du modèle dans la page.');

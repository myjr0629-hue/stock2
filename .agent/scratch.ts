const { calcPriceDisplay } = require('./src/utils/calcPriceDisplay.ts');
const S = {
    price: 348.95,
    changePercent: 0,
    prevClose: 345.62,
    session: 'closed',
    extended: {
        prePrice: 345.81,
        postPrice: 351.3
    }
};
console.log(calcPriceDisplay({ 
    livePrice: null, 
    apiDisplayPrice: S.price, 
    apiDisplayChangePct: S.changePercent, 
    session: S.session, 
    prevRegularClose: S.prevClose, 
    regularCloseToday: undefined, 
    extended: S.extended 
}));

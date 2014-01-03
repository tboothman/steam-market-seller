// ==UserScript==
// @name           Steam market seller
// @namespace      https://github.com/tboothman/steam-market-seller
// @description    Quickly sell items on steam market
// @version        0.4
// @include        http://steamcommunity.com/id/*/inventory
// @require        https://raw.github.com/caolan/async/master/lib/async.js
// @grant          none
// ==/UserScript==

(function($, async, g_rgAppContextData, g_strInventoryLoadURL, g_rgWalletInfo) {

    function SteamMarket(appContext, inventoryUrl, walletInfo) {
        this.appContext = appContext;
        this.inventoryUrl = inventoryUrl;
        this.walletInfo = walletInfo;
    }

    // Gets all items in your inventory for a game
    // e.g.
    // [: { // An item
    //          id: 1000,
    //          market_name: "Bloodstone of the Ancestor",
    //          ....
    //    }
    // ]
    //
    // Item:
    //{"id":"60967810",
    //	"classid":"171856304",
    //	"instanceid":"256346122",
    //	"amount":"1",
    //	"pos":5,
    //	"appid":"753",
    //	"icon_url":"hARaDSYycBddc2R60GxSGDxIkLxiQn5JmLy_bHmWA7dZDHTtcWUnD_Srfoj0TQCLLRODrTUIMlueveFte5cJr00FeKRtJSMM8PdzzfpTH48wAdb4bV1mCsqtt3V2nFOKXgtu9mZgBRL67HKf_kAbwD1Rhas9UGNY1O7sNynAVuwbAy_9aX58Ufi8eI6jGwyHMFjd9WFdMlvbv-o4e8xAqkIFO_tnOSAF69tyhvpECttnXoCtbF1oDdrs7DF7z17iSVMuqDx8dQb6sC-Po0AL32xa3fVrDmcDwqmwZjyPU-s=",
    //	"icon_url_large":"hARaDSYycBddc2R60GxSGDxIkLxiQn5JmLy_bHmWA7dZDHTtcWUnD_Srfoj0TQCLLRODrTUIMlueveFte5cJr00FeKRtJSMM8PdzzfpTH48wAdb4bV1mCsqtt3V2nFOKXgtu9mZgBRL67HKf_kAbwD1Rhas9UGNY1O7sNynAVuwbAy_9aX58Ufi8eI6jGwyHMFjd9WFdMlvbv-o4e8xAqkIFO_tnOSAF69tyhvpECttnXoCtbF1oDdrs7DF7z17iSVMuqDx8dQb6sC-Po0AL32xa3fVrDmcDwqmwZjyPU-s=",
    //	"icon_drag_url":"",
    //	"name":"Prison Architect",
    //	"market_hash_name":"245070-Prison Architect",
    //	"market_name":"Prison Architect",
    //	"name_color":"",
    //	"background_color":"",
    //	"type":"Steam Summer Getaway Trading Card",
    //	"tradable":1,
    //	"marketable":1,
    //	"market_fee_app":"233450",
    //	"descriptions":[{"value":""}],
    //	"owner_actions":[{"name":"View badge progress","link":"http://steamcommunity.com/my/gamecards/245070/"}],
    //	"tags":[{"internal_name":"droprate_0","name":"Common","category":"droprate","category_name":"Rarity"},{"internal_name":"app_245070","name":"Steam Summer Getaway","category":"Game","category_name":"Game"},{"internal_name":"item_class_2","name":"Trading Card","category":"item_class","category_name":"Item Type"}],
    //	"contextid":"6"}
    SteamMarket.prototype.getInventory = function(gameId, callback/*(error, inventory)*/) {
        var self = this;
        var game = this.getGames()[gameId];
        var contextId;
        var tasks = {};

        // Build the requests for each inventory context as tasks for async
        for (contextId in game.rgContexts) {
            tasks[contextId] = (function(contextId) {
                return function(next) {
                    $.get(self.inventoryUrl + gameId + '/' + contextId + '/', function(data) {
                        if (!data && !data.success) {
                            return next(true);
                        }

                        next(null, data);
                    }, 'json');
                }
            })(contextId);
        }

        // Request all the inventories
        async.parallel(tasks, function(err, results) {
            if (err) {
                return callback(err);
            }

            var items = [];

            for (var id in results) {
                if (results[id].rgInventory.length === 0) {
                    continue;
                }
                results[id] = denormalizeItems(results[id], id);

                for (var i in results[id]) {
                    results[id][i].contextid = id;
                    items.push(results[id][i]);
                }
            }

            callback(null, items);
        });
    };

    // Sell an item with a price in pennies
    // Price is before fees
    SteamMarket.prototype.sellItem = function(item, price, callback/*err, data*/) {
        var sessionId = readCookie('sessionid');
        $.ajax({
            type: "POST",
            url: 'https://steamcommunity.com/market/sellitem/',
            data: {
                sessionid: sessionId,
                appid: item.appid,
                contextid: item.contextid,
                assetid: item.id,
                amount: 1,
                price: price
            },
            success: function(data) {
                callback(null, data);
            },
            crossDomain: true,
            xhrFields: {withCredentials: true},
            dataType: 'json'
        });
    };

    SteamMarket.prototype.getGames = function() {
        return this.appContext;
    };

    // Get the price history for an item
    // PriceHistory is an array of prices in the form [data, price, number sold]
    // e.g. [["Fri, 19 Jul 2013 01:00:00 +0000",7.30050206184,362]]
    // Prices are ordered by oldest to most recent
    // Price is inclusive of fees
    SteamMarket.prototype.getPriceHistory = function(item, callback/*(err, priceHistory)*/) {
        $.get('http://steamcommunity.com/market/pricehistory/', {
            appid: item.appid,
            market_hash_name: item.market_hash_name
        }, function(data) {
            if (!data || !data.success || !data.prices) {
                return callback(true);
            }

            // Multiply out prices so they're in pennies
            for (var i = 0; i < data.prices.length; i++) {
                data.prices[i][1] *= 100;
                data.prices[i][2] = parseInt(100, 10);
            }

            callback(null, data.prices);
        }, 'json');
    };

    // Get the sales listings for this item in the market
    // Listings is a list of listing objects.
    // converted_price and converted_fee are the useful bits of info
    // {"listingid":"2944526023990990820",
    //	 "steamid_lister":"76561198065094510",
    //	 "price":2723,
    //	 "fee":408,
    //	 "steam_fee":136,
    //	 "publisher_fee":272,
    //	 "publisher_fee_app":570,
    //	 "publisher_fee_percent":"0.10000000149011612", (actually a multiplier, not a percentage)
    //	 "currencyid":2005,
    //	 "converted_price":50, (price before fees, amount to pay is price+fee)
    //	 "converted_fee":7, (fee added to price)
    //	 "converted_currencyid":2002,
    //	 "converted_steam_fee":2,
    //	 "converted_publisher_fee":5,
    //	 "asset":{"currency":0,"appid":570,"contextid":"2","id":"1113797403","amount":"1"}
    // }
    SteamMarket.prototype.getListings = function(item, callback/*err, listings*/) {
        $.get('http://steamcommunity.com/market/listings/' + item.appid + '/' +
                encodeURIComponent(item.market_hash_name) + '/render/?query=&search_descriptions=0&start=0&count=10', function(data) {

            if (!data || !data.success || !data.listinginfo) {
                return callback(true);
            }
            callback(null, data.listinginfo);
        });
    };

    // Calculate the price before fees (seller price) from the buyer price
    SteamMarket.prototype.getPriceBeforeFees = function(price, item) {
        price = Math.round(price);
        // market_fee may or may not exist - this is copied from steam's code
        var publisherFee = (item && typeof item.market_fee != 'undefined') ? item.market_fee : this.walletInfo['wallet_publisher_fee_percent_default'];
        var feeInfo = CalculateFeeAmount(price, publisherFee, this.walletInfo);

        return price - feeInfo.fees;
    };

    // Calculate the buyer price from the seller price
    SteamMarket.prototype.getPriceIncludingFees = function(price, item) {
        price = Math.round(price);
        // market_fee may or may not exist - this is copied from steam's code
        var publisherFee = (item && typeof item.market_fee != 'undefined') ? item.market_fee : this.walletInfo['wallet_publisher_fee_percent_default'];
        var feeInfo = CalculateAmountToSendForDesiredReceivedAmount(price, publisherFee, this.walletInfo);

        return feeInfo.amount;
    };

    function CalculateFeeAmount(amount, publisherFee, walletInfo) {
        if (!walletInfo['wallet_fee'])
            return 0;
        publisherFee = (typeof publisherFee == 'undefined') ? 0 : publisherFee;
        // Since CalculateFeeAmount has a Math.floor, we could be off a cent or two. Let's check:
        var iterations = 0; // shouldn't be needed, but included to be sure nothing unforseen causes us to get stuck
        var nEstimatedAmountOfWalletFundsReceivedByOtherParty = parseInt((amount - parseInt(walletInfo['wallet_fee_base'])) / (parseFloat(walletInfo['wallet_fee_percent']) + parseFloat(publisherFee) + 1));
        var bEverUndershot = false;
        var fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty, publisherFee, walletInfo);
        while (fees.amount != amount && iterations < 10) {
            if (fees.amount > amount) {
                if (bEverUndershot) {
                    fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty - 1, publisherFee, walletInfo);
                    fees.steam_fee += (amount - fees.amount);
                    fees.fees += (amount - fees.amount);
                    fees.amount = amount;
                    break;
                } else {
                    nEstimatedAmountOfWalletFundsReceivedByOtherParty--;
                }
            } else {
                bEverUndershot = true;
                nEstimatedAmountOfWalletFundsReceivedByOtherParty++;
            }
            fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty, publisherFee, walletInfo);
            iterations++;
        }
        // fees.amount should equal the passed in amount
        return fees;
    }

    // Strangely named function, it actually works out the fees and buyer price for a seller price
    function CalculateAmountToSendForDesiredReceivedAmount(receivedAmount, publisherFee, walletInfo) {
        if (!walletInfo['wallet_fee']) {
            return receivedAmount;
        }
        publisherFee = (typeof publisherFee == 'undefined') ? 0 : publisherFee;
        var nSteamFee = parseInt(Math.floor(Math.max(receivedAmount * parseFloat(walletInfo['wallet_fee_percent']), walletInfo['wallet_fee_minimum']) + parseInt(walletInfo['wallet_fee_base'])));
        var nPublisherFee = parseInt(Math.floor(publisherFee > 0 ? Math.max(receivedAmount * publisherFee, 1) : 0));
        var nAmountToSend = receivedAmount + nSteamFee + nPublisherFee;
        return {
            steam_fee: nSteamFee,
            publisher_fee: nPublisherFee,
            fees: nSteamFee + nPublisherFee,
            amount: parseInt(nAmountToSend)
        };
    }

    // Get a list of items with description data from the inventory json
    function denormalizeItems(inventory) {
        var id;
        var item;
        var description;

        for (id in inventory.rgInventory) {
            item = inventory.rgInventory[id];
            description = inventory.rgDescriptions[item.classid + '_' + item.instanceid];
            for (var key in description) {
                item[key] = description[key];
            }
        }

        return inventory.rgInventory;
    }

    function readCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) == ' ')
                c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) == 0)
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
        return null;
    }








    function calculateSellPrice1(history, listings) {
        // Fairly safe sell
        // Highest average price in the last 24 hours
        // Must be at least 1p below lowest current listing

        var oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        var highestAverage = 0;
        history.forEach(function(historyItem) {
            var d = new Date(historyItem[0]);
            if (d.getTime() > oneDayAgo) {
                if (historyItem[1] > highestAverage) {
                    highestAverage = historyItem[1];
                }
            }
        });

        if (!highestAverage) {
            return 0;
        }

        if (Object.keys(listings).length === 0) {
            return 0;
        }

        var firstListing = listings[Object.keys(listings)[0]];

        if (highestAverage < (firstListing.converted_price + firstListing.converted_fee - 1)) {
            return firstListing.converted_price - 1;
        } else {
            return market.getPriceBeforeFees(highestAverage);
        }
    }



    var market = new SteamMarket(g_rgAppContextData, g_strInventoryLoadURL, g_rgWalletInfo);

    var sellQueue = async.queue(function(task, next) {
        market.sellItem(task.item, task.sellPrice, function(err, data) {
            if (!err) {
                console.log(task.item.name + ' put up for sale at ' + task.sellPrice + ' (' + market.getPriceIncludingFees(task.sellPrice) + ')');
            }
            next();
        });
    }, 1);

    market.getInventory(753, function(err, items) {
        console.log(items);

        items.forEach(function(item) {
            if (!item.marketable) {
                console.log('Skipping: ' + item.name);
                return;
            }

            market.getPriceHistory(item, function(err, history) {
                if (err) {
                    console.log('Failed to get price history for ' + item.name);
                    return;
                }
                market.getListings(item, function(err, listings) {
                    if (err) {
                        console.log('Failed to get listings for ' + item.name);
                        return;
                    }
                    console.log(item.name);
                    console.log('Average sell price, last hour: ' + history[history.length - 1][1]);
                    console.log('Average seller price, last hour: ' + market.getPriceBeforeFees(history[history.length - 1][1]));
                    if (Object.keys(listings).length === 0) {
                        console.log('Not listed for sale');
                        return;
                    }
                    var firstListing = listings[Object.keys(listings)[0]];
                    console.log('First listing price: ' + firstListing.converted_price + ' + ' + firstListing.converted_fee + ' = ' + (firstListing.converted_price + firstListing.converted_fee));

                    var sellPrice = calculateSellPrice1(history, listings);
                    console.log('Calculated sell price: ' + sellPrice + ' (' + market.getPriceIncludingFees(sellPrice) + ')');
                    if (sellPrice > 0) {
                        sellQueue.push({
                            item: item,
                            sellPrice: sellPrice
                        });
                    }
                });
            });
        });

    });

})(jQuery, async, g_rgAppContextData, g_strInventoryLoadURL, g_rgWalletInfo);
// ==UserScript==
// @name           Steam market seller
// @namespace      https://github.com/tboothman/steam-market-seller
// @description    Quickly sell items on steam market
// @version        0.2
// @include        http://steamcommunity.com/id/*/inventory
// @require        https://raw.github.com/caolan/async/master/lib/async.js
// ==/UserScript==

(function($, async, g_rgAppContextData, g_strInventoryLoadURL){
    function SteamMarket(appContext, inventoryUrl) {
        this.appContext = appContext;
        this.inventoryUrl = inventoryUrl;
    }

    // Get all your inventory items for this game. Items are grouped by 'context'
    // e.g.
    // {
    //      2: { // Inventory for context 2
    //          1000: { // An item
    //              id: 1000,
    //              market_name: "Bloodstone of the Ancestor",
    //              ....
    //          }
    //      }
    // }
    SteamMarket.prototype.getInventory = function(gameId, callback/*(error, inventory)*/) {
        var self = this;
        var game = this.getGames()[gameId];
        var contextId;
        var tasks = {};

        // Build the requests for each inventory as tasks for async to process
        for (contextId in game.rgContexts) {
            tasks[contextId] = function(next) {
                $.get(self.inventoryUrl+gameId+'/'+contextId+'/', function(data) {
                    if (!data && !data.success) {
                        return next(true);
                    }

                    next(null, data);
                }, 'json');
            };
        }

        async.parallel(tasks, function(err, results) {
            if (err) {
                return callback(err);
            }

            for (var id in results) {
                results[id] = denormalizeItems(results[id], id);
            }

            callback(null, results);
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
            xhrFields: { withCredentials: true },
            dataType: 'json'
        });
    };

    SteamMarket.prototype.getGames = function() {
        return this.appContext;
    };

    // Get the price history for an item
    // PriceHistory is an array of prices in the form [data, price, number sold string]
    // e.g. [["Fri, 19 Jul 2013 01:00:00 +0000",0.0730050206184,"362 sold"]]
    // Prices are ordered by oldest to most recent
    SteamMarket.prototype.getPriceHistory = function(item, callback/*(err, priceHistory)*/) {
        $.get('http://steamcommunity.com/market/pricehistory/', {
                appid: item.appid,
                market_hash_name: item.market_hash_name
            }, function(data) {
                if (!data && !data.success && !data.prices) {
                    return callback(true);
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
    //	 "publisher_fee_percent":"0.10000000149011612",
    //	 "currencyid":2005,
    //	 "converted_price":50,
    //	 "converted_fee":7,
    //	 "converted_currencyid":2002,
    //	 "converted_steam_fee":2,
    //	 "converted_publisher_fee":5,
    //	 "asset":{"currency":0,"appid":570,"contextid":"2","id":"1113797403","amount":"1"}
    // }
    SteamMarket.prototype.getListings = function(item, callback/*err, listings*/) {
        $.get('http://steamcommunity.com/market/listings/'+item.appid+'/'+
                encodeURIComponent(item.market_name)+'/render/?query=&search_descriptions=0&start=0&count=20', function(data) {

            if (!data && !data.success && !data.listinginfo) {
                return callback(true);
            }
            callback(data.listinginfo);
        });
    };

    // Get a list of items with description data from the inventory json
    function denormalizeItems(inventory, contextId) {
        var id;
        var item;
        var description;

        for (id in inventory.rgInventory) {
            item = inventory.rgInventory[id];
            description = inventory.rgDescriptions[item.classid + '_' + item.instanceid];
            for (var key in description) {
                item[key] = description[key];
            }
            item.contextid = contextId;
        }

        return inventory.rgInventory;
    }

    function readCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for(var i=0;i < ca.length;i++) {
            var c = ca[i];
            while (c.charAt(0)==' ') c = c.substring(1,c.length);
            if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length,c.length));
        }
        return null;
    }





    var market = new SteamMarket(g_rgAppContextData, g_strInventoryLoadURL);

    market.getInventory(570, function(err, data) {
        console.log(data);

//        market.getPriceHistory(data[2][1386792576], function(err, data) {
//            console.log(data);
//        });
//
//        market.sellItem(data[2][1386792576], 88, function(err, data) {
//            console.log('success!');
//        });

    });
})(jQuery, async, g_rgAppContextData, g_strInventoryLoadURL);
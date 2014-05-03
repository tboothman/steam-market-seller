Steam Market Seller
===================

A [greasemonkey](http://www.greasespot.net/) script that automatically prices and sells all items in your inventory for a particular game.


A button is added to your inventory page next to the logo. This will work out a good price to sell each item and put it up for sale. The price is the highest average price in the last 24 hours with a minimum of 1p below the current lowest listing price. See calculateSellPrice() for the calculation.

The SteamMarket object can be used as a simple API to the steam market, and could be used for other market related tasks

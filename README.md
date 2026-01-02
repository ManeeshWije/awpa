# amazon wishlist price alert

quick and dirty way to monitor wishlist price changes on amazon.

need to run login.ts first to get cookies.

scrape.ts should be run periodically (e.g. via cron) to check for price changes.

current wishlist on amazon will track price drops that occur not by sales but by normal price changes, i.e it will say price dropped by 4% from the time you added the item to the wishlist. It will _not_ say this if the price drops due to a sale however, it will just show the big red sale label which is fine. This script just aims to simplify both those cases and automate the notification process when price changes by a specific delta.

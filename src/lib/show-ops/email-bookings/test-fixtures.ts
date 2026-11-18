/** Booking email fixtures for the unit tests. */
// Made-up guests and references, laid out like the real emails Ruth forwarded (28 Sept 2026).
export const WOO_SUBJECT = "[MHT- Music Hall Tavern]: New order #TFS/20957";
export const WOO_TEXT = `[image: MHT- Music Hall Tavern]
<https://musichalltavern.com/>
New Order: #TFS/20957
You’ve received the following order from Jane Testperson:
[Order #TFS/20957] (29 September 2026)
Product Quantity Price
Tenerife Adult Dinner Show – Friday 2 Oct 2026 (#TFS_AD_8027) 4 196,00 €
Tenerife Child Dinner Show – Friday 2 Oct 2026 (#TFS_CH_8028) 1 25,00 €
Subtotal: 221,00 €
Payment method: Link
Total: 221,00 €
Name of accommodation you are staying in (this is for the office): Hotel Test Palace
Do you have any infants under 4? Yes 1
Billing address
Jane Testperson
1 Example Street
Exampletown
+44 7700 900000
jane.test@example.com

Congratulations on the sale.`;

export const GYG_SUBJECT = "Booking - S100001 - GYGTEST12345";
export const GYG_TEXT = `[image: GetYourGuide]
Hi supply partner,
Your offer has been booked:
*Music Hall Tavern Dinner Show Tenerife*
Option: Dinner and Show - Direct Guests South
Reference number
*GYGTEST12345*
Date
September 29, 2026, 7:15 PM
Number of participants
*2 x* Adults (Age 13 - 99)
1 x Child (Age 4 - 12)
2 x MHT VIP Experience
Main customer
Alex Example
customer-abc@reply.getyourguide.com
Phone: +44 7700 900111
Language: English
Price
€ 150.00`;

/** A website order as Gmail's text copy really lays it out (18 Nov 2026): blank lines, a VIP add-on. */
export const WOO_VIP_SUBJECT = "[MHT- Music Hall Tavern]: New order #TFS/99999";
export const WOO_VIP_TEXT = `New Order: #TFS/99999

You’ve received the following order from Sam Example:

[Order #TFS/99999] (November 18, 2026)

Product
Quantity
Price

Tenerife Adult Dinner Show – Tuesday 22 Dec 2026 (#TFS_AD_13480)

4

156,00 €

MHT VIP Experience (#VIP)

4

60,00 €

Subtotal:
216,00 €

Payment method:
PayPal (sam.paypal@example.com)

Total:
216,00 €

Extra Information

Name of accommodation you are staying in

Airbnb

Do you have any infants under 4?

No Infants

Billing address

Sam Example
Example-Str. 44
81245 Exampletown
Germany
+4915700000000
sam.example@example.com

PixelYourSite
Your clients don't see this information!`;

/** A GetYourGuide booking where Gmail's text runs the customer details together on one line. */
export const GYG_RUNON_TEXT = `Hi Supply Partner, great news!
Your offer has been booked:

Tenerife: MHT Comedy Drag Dinner Experience
Tenerife: MHT Comedy Drag Dinner Show – Direct Guests South

Reference number

GYGZZZZTEST1

Date

December 24, 2026, 7:15 PM

Number of participants

2 x Adults (Age 13 - 99)

Main customer

Alex Example customer-abc123@reply.getyourguide.comPhone: +44 7700 900222Language: English

Tour language

English (Host or greeter)

Price

€ 98.00`;

# your notes checked — 5 September

Joel, ive gone back through all 135 notes rather than carrying the old done labels forward. a lot is built, but the PDF is too confident in places and a few answers are now out of date

**46 partly done** | **47 needs input or work** | **42 built, needs a live check**

these are note counts, not a percentage of development complete. some notes are a small display change and others are a whole future module. “built, needs a live check” means the code supports it, not that youve accepted it or an email has arrived. “needs input or work” includes things not built and things waiting on your sheets or decisions

this audit uses your `try number 1.pdf` and the current code. repeated rows at PDF page breaks are counted once. the earlier Word version supplies the 135 note labels only. nothing here changes an agreed price or moves something into an extra package

the speed problem was real. the database access rules for businesses and team members called back into each other and produced the errors in the screenshot. that is fixed live. the same authenticated request now succeeds. booking permissions also used to repeat access checks for each row. the same year of partner totals took 699 ms before, 274 ms on the first run after and 20 ms on the repeat, with 225 partner groups and 11,090 booking rows. that measures one database query, not full browser load time

Reports now loads through all result pages, shows failures instead of incomplete totals and keeps its pound and euro amounts separate by island. it also applies the island to invoice and payment totals. older invoices with no island are clearly excluded when an island is selected. very large reports ask for a narrower period rather than quietly cutting rows off. Dashboard, Outlook, CSV exports and month-end invoice generation still need the same completeness review — this change does not fix those routes

live record counts checked: 16,032 bookings, 1,213 hotels, 327 pickup points, 418 imported timetables, 469 partners, 14 shows, 39 rate cards and 9,608 rate prices. transport is set to 10. zero partners are explicitly tagged Gran Canaria. booking dates range from 5 September 2025 to 24 October 2027. those counts do not prove the source data is complete or correctly priced

my next order would be complete and reconcile invoice previews, generation, dashboard, outlook and exports first, then finish the UK currency and ticket-time paths. after that, seller cancellation approvals, partner invoice access and a proper backup/restore check. we still need your rates, rounding rule, guest-ticket sample and the session with you, Ruth and Luke before signing off the reports or building Accounts


## general hub notes

| # | your note | honest status | where we are |
|---|---|---|---|
| 1 | very slow? | partly done | your screenshot was a real database fault. that loop is fixed live and the booking access checks are faster. Reports also needed complete loading and visible errors. i still need whole-page timings on bookings, lists and reports before calling the speed sorted |
| 2 | app version / mobile version? | partly done | you have a mobile web app you can save to your home screen. a native app and reliable offline use are not built, and we still need to try the main screens on your phone |
| 3 | link to Jesus for API Verifactu | needs input or work | the invoice fields and provider adapter exist. i need Jesus to confirm the provider, certificate and legal details before this is a working approved connection |
| 4 | link & introduce to Vince | needs input or work | i still need the introduction and a list of what Vince already runs |
| 5 | emails / SMS / WA / MailerLite / GDPR / merging / API for web sales direct | partly done | email and phone-message sending exist, with test gates. MailerLite, website integration, merging and your GDPR process are not all finished by turning one switch on |
| 6 | GYG API | needs input or work | GYG exists as a sales channel. a connected two-way GYG API has not been established |
| 7 | back up & server, maybe Vince | partly done | the export is scheduled every five minutes but it is not a full recovery copy. newer tables and original stored files are missing. recent successful runs and a restore drill still need checking |
| 8 | monthly reports to certain users or emails, in one go or download | partly done | the daily email exists. monthly packs, chosen report recipients and Google Sheets need agreeing and building. delivery still needs testing |

## dashboard

| # | your note | honest status | where we are |
|---|---|---|---|
| 9 | remove FUE | needs input or work | the dashboard uses your configured islands. i need to confirm FUE is removed from that live configuration before promising it is gone everywhere |
| 10 | date change option to select month & year | built, needs a live check | the month and year selector is there. some dashboard totals still need complete loading and clearer filter labels |
| 11 | need attention thing | partly done | basic warnings are there. a personal list with ownership, clear and mark done is still outstanding |
| 12 | custom on user | needs input or work | a personal attention list is not built just because users have different page permissions |
| 13 | mark done, clear when done, notify seniors (Joel, Ruth, Rich) | needs input or work | mark done, clear and notify seniors still need the actual attention workflow |
| 14 | different users: res users when bus is full | built, needs a live check | partners have a database capacity guard and staff have a deliberate override. we still need a last-seat demonstration using your real capacity setup |
| 15 | last few seats: Ruth or a senior gets told, then change or close | needs input or work | i need your seats-left threshold and recipients. an on-screen warning is not an automatic notification |
| 16 | Ruth / us when a supplier requests to cancel | needs input or work | seller cancellation approval is not a usable flow yet. the partner portal still tells them to contact the office |
| 17 | user based dashboard | needs input or work | page access is personalised. the dashboard and action queue are not yet different for each person |
| 18 | messages between teams? | needs input or work | team chat is not implemented. the old one-day estimate is not a delivery commitment |

## outlook

| # | your note | honest status | where we are |
|---|---|---|---|
| 19 | move under Show calendar | built, needs a live check | outlook and show calendar link to each other |
| 20 | remove FUE | partly done | FUE has no outlook block. removal from every other screen depends on the configured island list |
| 21 | Tenerife: merge TFS & TFW, remove Puerto de la Cruz | built, needs a live check | Tenerife is one block with South, Adeje, Golf and West. old Puerto bookings remain in Other so history is kept |
| 22 | €€ what is this, or is it pay on door? | partly done | it is booked value and average per person, not money due on the door. outlook still labels UK amounts in euros and needs correcting |
| 23 | bus count, what when 2, i.e. LPA | built, needs a live check | bus count and ordered seats support more than one bus |
| 24 | only 7 days or 7 shows, unless we choose 14 | partly done | the selector says seven or fourteen but the inclusive date range currently creates eight or fifteen dates. that needs fixing |
| 25 | what is the Hotel / Resort button? | built, needs a live check | hotel and resort are two ways of grouping the same bookings |

## seller link

| # | your note | honest status | where we are |
|---|---|---|---|
| 26 | i possibly want to look at this but want to see how it works | built, needs a live check | secure invitations and own-booking seller access are implemented. a crowned partner admin can see the organisation and manage its ordinary sellers within island limits. i still need to show you the actual invite and login |
| 27 | request to CXL only 24 hours before, and must be approved | needs input or work | the request and approval flow is not built. we also need the exact meaning of the 24-hour cutoff |
| 28 | see invoices | needs input or work | partners cannot yet view issued invoices from their portal |
| 29 | see ticket pics, | built, needs a live check | the old answer is out of date. sellers can now upload and view ticket photos on their own bookings |

## shows (owners / super admin only)

| # | your note | honest status | where we are |
|---|---|---|---|
| 30 | this only owners / super admin, i.e. Ruth | built, needs a live check | owner and admin roles can manage shows. restricted admins are limited to their islands. your actual team permissions still need checking with you |
| 31 | i need showing as confused on options | partly done | the editor now separates show details, ticket types and extras. it uses one ticket price plus transport. the calm walkthrough is still to do |
| 32 | delete option | built, needs a live check | unused shows can be deleted. used shows need switching off so booking history stays |
| 33 | when change, what about bookings before that date and invoicing | partly done | new bookings keep their sold-price snapshot. imported bookings without one can still be recalculated at invoice creation. that needs reconciling before claiming every old booking is protected. reprice targets uninvoiced bookings, not unbooked tickets |
| 34 | can we schedule a price change so forward bookings are correct? | needs input or work | scheduled effective-date prices are not implemented yet |
| 35 | netts? why?? | built, needs a live check | netts have been removed from the show editor and future pricing uses the partner rate |
| 36 | why 2 line price | partly done | there is now one ticket price and your live transport supplement is 10. adults and children share that supplement. a separately free child bus charge is not supported yet |
| 37 | transport nights? and resorts | built, needs a live check | show nights and pickup nights control available stops. we still need to check the actual resort and night setup |
| 38 | when tour, can we choose GBP not EUR? | partly done | island currency is supported but the UK payment-link and background guest-ticket paths still have currency gaps. UK to invoice needs a full test |
| 39 | ticket type? | built, needs a live check | custom ticket types have their own prices and optional extras can be added. types share the physical show's capacity |
| 40 | real prices and start times | needs input or work | the stored prices need matching to your source rates. configured start times are not yet used consistently on guest tickets, so i cannot promise the ticket shows 7pm |

## partners (owners / super admin only)

| # | your note | honest status | where we are |
|---|---|---|---|
| 41 | this is only owners / super admins | built, needs a live check | partner editing is owner/admin only with island restrictions. global permissions need an owner or unrestricted admin |
| 42 | island sort | partly done | search, filters and multi-island tagging work in code. the live data still has zero partners explicitly tagged Gran Canaria |
| 43 | delete option | partly done | Delete refuses a used partner and tells you to untick Active. it does not automatically archive them as the old answer says |
| 44 | invoice nett, some showing 100 % | partly done | 100% means invoice the full ticket amount. deposit-only partners no longer show an irrelevant invoice-nett field. i still need the intended partner rates and a reconciliation before changing money |
| 45 | invoice rate, where are these or how do we set up? | partly done | the 39 rate cards and 9,608 price rows are in the database. that does not mean the current booking calculator uses those cards. it uses show/type prices and partner percentages, so legacy rate mapping still needs work |
| 46 | deposit or take all options? | built, needs a live check | deposit or invoice mode is configurable and a 100% deposit takes the full amount. desk choice is only available where the partner allows it |
| 47 | booking supplier link, happy to explore | built, needs a live check | the seller and crowned admin portal exists. showing you the invite, login and organisation results is still outstanding |
| 48 | cancel requests for partners, and not book if no space. really important | partly done | capacity protection is implemented. cancellation requests and approval are not. these need separate statuses |

## hotel pick-ups (owners / super admin only)

| # | your note | honest status | where we are |
|---|---|---|---|
| 49 | again only owners / super admin | built, needs a live check | hotels and pickup editing have senior-role and island restrictions |
| 50 | page buffering so long i couldn't scroll | partly done | the directory avoids rendering every edit form at once and searches the full accessible directory. the database loop is fixed. i still need a fresh browser timing before saying it loads instantly |
| 51 | no filters, no hotel names showing | built, needs a live check | you can type a hotel or pickup name and use island and resort filters. missing configured pickup details still need filling in |
| 52 | not splitting hotels / bus pick-up points | built, needs a live check | hotels and pickup points are separate tabs. hotel rows link to the stop information |
| 53 | guide notes add a pic or link for the bus list print | built, needs a live check | guide notes, map and photo links are available. the bus sheet prints and downloads. the downloaded PDF includes links rather than embedding remote stop photos |

## bus board

| # | your note | honest status | where we are |
|---|---|---|---|
| 54 | how to move the stops around for the night, as it says bottom is permanent? | built, needs a live check | you can drag stops for one night, save, reset to permanent order, print and download. sharing uses the saved order |
| 55 | guide name add option | built, needs a live check | guide names appear on bus sheets. the email-with-PDF feature is also implemented now, but actual delivery still needs testing |
| 56 | tell guests by SMS / WA with stop image & map, confirmation they read or auto reply | needs input or work | guest messaging exists but a stop-photo/map message with read confirmation or an automatic reply is not a completed workflow |

## bookings

| # | your note | honest status | where we are |
|---|---|---|---|
| 57 | add ticket when all in / IN, then have this for invoicing | partly done | supplier ticket numbers, photo upload and invoice photo attachments exist. an exact automatic all-IN stamp or trigger still needs defining |
| 58 | partner type / sales channel, need to sort this | built, needs a live check | choosing a partner fills the sales channel and staff can override it. imported partner types still need checking |
| 59 | who created, time, date and edit logs | partly done | creator details and automatic booking/payment history are present. automatic history starts on 5 September. older missing edits cannot be reconstructed and technical token changes are excluded |
| 60 | CXL but don't remove? | built, needs a live check | cancellation keeps the booking and its history. cancelled bookings can be filtered and invoiced bookings have extra guards |

## check-in quick (now night lists) and door

| # | your note | honest status | where we are |
|---|---|---|---|
| 61 | slightly confused if this is Door too, both very same | built, needs a live check | Night lists are the office and printed lists. Door is for arrivals. they intentionally update the same booking |
| 62 | mark when here, is this only if 1 or 2? | built, needs a live check | you can mark All in or enter how many arrived. missing guests follow the charge or write-off decision |
| 63 | remove cash or card when invoice? | built, needs a live check | invoice bookings hide the cash/card arrival controls |
| 64 | print option of all these, and layout so can see | partly done | print layouts exist and the bus sheet also has PDF download. we still need to check every real long list, page break and layout with you |
| 65 | daily sales, move to another tab | built, needs a live check | daily sales is in Reports. it counts when a booking was taken, which is different from its show date |
| 66 | door, is this the same as the office list? | built, needs a live check | Door is the arrival screen and Night lists is the office list. both use the same records |
| 67 | show comments / diet here, colour highlights (diet one colour, balances another, comments another) | partly done | diet, balance and comment colours are implemented with phone labels and printed text. i have not proved every long sheet fits every phone without sideways scrolling |

## door

| # | your note | honest status | where we are |
|---|---|---|---|
| 68 | QR and how this works, what is sent to the guest | partly done | guest QR tickets and repeat-scan protection are implemented. provider setup, actual sending and a real scan still need checking. the camera has a manual fallback |
| 69 | bookings need to show comments / diet here | built, needs a live check | Door uses the same diet and comment flags |
| 70 | remove Day, just evening | built, needs a live check | Door shows everyone on the chosen date without a separate day filter |
| 71 | need to see live tbh | needs input or work | the fifteen-second refresh exists. the real-night and two-phone trial still needs doing |
| 72 | time stamps off sync? | built, needs a live check | timestamps use the device timezone with a Canary-time reference. the device clock setting still matters |
| 73 | seems both Door and quick check-in mixed? | built, needs a live check | the labels now explain Door and Night lists. i still need to walk you through how they share arrivals |
| 74 | app version | partly done | it is a mobile web app with home-screen support. native App Store and offline behaviour are not established |
| 75 | photo option and attach to booking for invoices | built, needs a live check | photos attach to bookings and can now be sent as originals with the invoice PDF. the old being-built answer needs updating |

## new booking

| # | your note | honest status | where we are |
|---|---|---|---|
| 76 | Joel to explain round-up deposit, only for some partners (all TFS & ACE, not LPA) | needs input or work | deposit rounding is currently to cents. i need nearest 5 or 10, direction, per head or per booking, and which partners before building your rule |
| 77 | all boxes need to start typing and bring it up, not a full list | partly done | partner, hotel and pickup are searchable. not every selector is a typeahead yet |
| 78 | refs need sort | partly done | new numeric references continue after the imported maximum with a lock. the final Lanzasoft reference and full import still need reconciling |
| 79 | ticket print, need to template the PDF we give to guests | needs input or work | i need one of your actual guest tickets to match the layout |
| 80 | also on this page do "Send to Guest" | partly done | Send to Guest supports email and phone messaging from booking detail. delivery and the exact placement you want still need checking |
| 81 | how to add payments: direct, cash / card, mark for reporting, especially UK sales | partly done | payment methods and recorded payments exist. UK currency and full reporting reconciliation still have gaps |
| 82 | transport: what is Show? always blank | needs input or work | the form shows a configured start time. the actual values and the public/email ticket time still need correcting and checking |
| 83 | show time great but not stop name, maybe that needs to be the show part? | built, needs a live check | the pickup selector shows stop and pickup time, with show time separately underneath |
| 84 | 5/9 ADD: Private options to Hotel / Villa / AirBnB / Friends & Family, shows on office list e.g. private PDC | built, needs a live check | private hotel, villa, Airbnb and friends/family details flow through shared labels on the booking, lists and guest ticket |

## reports (certain users only)

| # | your note | honest status | where we are |
|---|---|---|---|
| 85 | this just certain users | partly done | Reports has a page permission check but the daily-sales CSV route still lacks that same page gate. database row permissions still apply |
| 86 | more to add, i need to break down what we use and need | needs input or work | i need your actual breakdown sheets and definitions before calling this matched |
| 87 | how can we export better to PDF or Google Sheet | partly done | CSV exists. automatic monthly packs, report PDFs and Google Sheets are not complete. existing CSV row limits also need fixing |
| 88 | tickets & Stats, i need to explain, show you this spreadsheet | needs input or work | i still need the Tickets and Stats spreadsheet |
| 89 | tour Op / Direct split needs to break down more, not right | needs input or work | sales channel and partner type currently drive different splits. we need your definitions and correct imported classifications |
| 90 | remove Cash Taken | built, needs a live check | the Cash Taken tile is removed |
| 91 | stats / Insights, isn't this just Reports? | built, needs a live check | Stats is folded into the year block in Reports and the old route redirects |
| 92 | daily sales better under Insights / Stats or the dashboard | built, needs a live check | daily sales now sits in Reports |
| 93 | 5/9 ADD: go over with Matty & Luke our sales data so it mirrors Week / Month / Year tabs, then make it better | partly done | week, month, year and date filters exist. this release fixes complete report loading and separates currencies. your workbook layout and totals still need matching with you and Luke |

## settings

| # | your note | honest status | where we are |
|---|---|---|---|
| 94 | roles, i need to check through this | built, needs a live check | roles, page permissions and island access exist. we need to set and test the real matrix for you, Ruth, Rich and each desk |
| 95 | in-house mail sample | partly done | the sample-email action exists and respects test mode. an allowlisted address alone does not prove it reaches the inbox |
| 96 | verifactu name and things | built, needs a live check | issuer, NIF, series, address and tax settings exist. Jesus still needs to confirm the values and provider process |
| 97 | back up options? | partly done | backup controls exist but the custom export omits newer data and original files. the page also says six hours while the schedule is five minutes |
| 98 | think all data based now to help see this more? | partly done | the main record counts match live, including 16,032 bookings. counts do not prove no duplicates, correct prices, complete source coverage or reconciled balances |

## invoicing

| # | your note | honest status | where we are |
|---|---|---|---|
| 99 | need to face-to-face this, be shown, calmly. slightly confused | partly done | draft, issue, send, payment and overdue steps exist. month-end generation still has unpaginated reads and needs a real-period reconciliation before saying every booking is included |
| 100 | ticket pics from check-in / bookings as part of the send, in a file or a PDF of them all | built, needs a live check | invoice emails can now attach original ticket photos. it is not one combined photo PDF. missing photos are reviewed and large packs have explicit size limits |
| 101 | packs preview totals 0?? | partly done | preview and generation do not yet use identical eligibility and legacy-price rules. a difference is not always just IGIC. this needs fixing and checking against one real period |
| 102 | invoice PDF template and what's sent | partly done | PDF download and attachment exist with legal fields and paid state. the downloadable PDF does not embed your logo. the layout and actual inbox delivery still need review |
| 103 | verifactu | needs input or work | Jesus and the provider still need to confirm the connection and required details |
| 104 | when sent to them, a confirmation they opened it | partly done | sent time and recipient are recorded after provider success. opened or read tracking is not built |
| 105 | overdue list, link into each overdue one | partly done | the overdue list and invoice links exist. it still needs complete loading and a check that drafts and mixed currencies are treated properly |
| 106 | overdue reminders to Ruth / us etc | partly done | the daily email includes overdue invoices but the loader is not paginated and actual sending has not been verified. i cannot promise every overdue invoice yet |
| 107 | generally good but need to go over | needs input or work | we still need the calm invoice walkthrough with a real period, layout, photos and controlled delivery |

## accounts / p&l (seniors only)

| # | your note | honest status | where we are |
|---|---|---|---|
| 108 | obviously seniors only | needs input or work | senior-only access is a requirement for the future Accounts module. the module itself is not built |
| 109 | outstanding invoices, i think we have | partly done | overdue receivables exist. that is different from bills you owe, and opening unpaid balances still need reconciling |
| 110 | setting up P&L part | needs input or work | P&L by island and combined is not built. i need your sheets and agreed scope |
| 111 | income from invoices, but also option to amend | needs input or work | invoice income flowing into Accounts with controlled adjustments is not built |
| 112 | income manual | needs input or work | manual accounting income is not built |
| 113 | categories | needs input or work | accounting categories need your sheets and Jesus before implementation |
| 114 | IGIC divide etc | partly done | invoices have net and tax fields. the P&L-level tax split is not built or approved |
| 115 | following the main sample of ours now, as Jesus compliant | needs input or work | i need your sample and Jesus to confirm the accounting treatment. software alone cannot provide that approval |
| 116 | gastos | needs input or work | the expense ledger is not built |
| 117 | upload to P&L, also upload the factura and files | needs input or work | P&L entries with invoice and receipt uploads are not built |
| 118 | cash paid box | needs input or work | the Accounts cash-paid box is not built |
| 119 | if transfer needed, upload to "Outstanding outs", date based, notifications to Joel / Ruth | needs input or work | bills payable, due dates and reminders to you and Ruth are not built |
| 120 | ES / Jesus approved for IGIC / tax etc | needs input or work | Jesus needs to review the treatment and handle the tax approval and filings |
| 121 | download for Jesus option | needs input or work | the Accounts export needs the format Jesus wants and the module building first |
| 122 | Nóminas breakdown add in | needs input or work | payroll breakdown is not built. scope it from your actual requirements |
| 123 | card reconciles, need to go over | needs input or work | card reconciliation is not built. i need the statements and how you match them |
| 124 | tracker Golden Ticket | needs input or work | the Golden Ticket tracker is not built. i need the source tracker and agreed scope |
| 125 | tracker in-resort sales UK | needs input or work | the UK in-resort tracker is not built. i need the source tracker |

## the sheets youre using now

| # | your note | honest status | where we are |
|---|---|---|---|
| 126 | sales data x 3 islands | needs input or work | i need your three-island sales workbook to reconcile the week, month and year views |
| 127 | suppliers | needs input or work | 469 partners are present. i still need to match their names, islands and intended rates to your sheet |
| 128 | P&L x 3 and general | needs input or work | i need the P&L sheets for the unbuilt Accounts module |
| 129 | LS stuff | partly done | bookings have been imported and live dates run from September 2025 to October 2027. source completeness, duplicates, cutover and opening balances still need checking |
| 130 | outstanding invoices | partly done | the overdue screen exists. that is not proof your opening unpaid balances have already been imported |
| 131 | outstanding outs | needs input or work | outstanding bills you owe need the unbuilt payables module and your source sheet |
| 132 | CPH buses | partly done | Reports calculates bus cost divided by booked transport passengers. we need your sheet to settle infants, actual boarded passengers and multi-bus treatment |
| 133 | golden Ticket trackers | needs input or work | i need the Golden Ticket tracker before building or confirming scope |
| 134 | harper trackers? | needs input or work | i need to understand what Harper tracks and who uses it |
| 135 | card reconcile | needs input or work | i need a card statement and your current matching process before building reconciliation |

## what was checked

The two database repairs were applied to the Solvio database, not Tipsi. The exact live recursion request was rerun successfully. Local role-isolation tests cover owners, staff, sellers, organisation admins and outsiders, including a prepared query switching users. Application tests and the release checks are recorded in the evidence file. No real guest or partner was contacted, no real booking was edited, and no backup restore or show-night acceptance test was performed

[code evidence and remaining checks](./MHT%20-%20notes%20audit%20evidence%20-%205%20September.md)

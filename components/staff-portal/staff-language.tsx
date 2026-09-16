'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type StaffLanguage = 'en' | 'hi' | 'gu';

const translations: Record<string, [string, string]> = {
  'Home': ['होम', 'હોમ'],
  'Dashboard': ['डैशबोर्ड', 'ડૅશબોર્ડ'],
  'All Bookings': ['सभी बुकिंग', 'બધી બુકિંગ'],
  'Create booking': ['बुकिंग बनाएँ', 'બુકિંગ બનાવો'],
  'Bookings': ['बुकिंग', 'બુકિંગ'],
  'Quotes': ['कोटेशन', 'કોટેશન'],
  'Quotations': ['कोटेशन', 'કોટેશન'],
  'Calendar': ['कैलेंडर', 'કૅલેન્ડર'],
  'Event Tracking': ['इवेंट ट्रैकिंग', 'ઇવેન્ટ ટ્રૅકિંગ'],
  'Job Tracker': ['जॉब ट्रैकर', 'જોબ ટ્રૅકર'],
  'Close Jobs': ['जॉब बंद करें', 'જોબ બંધ કરો'],
  'Modifications': ['बदलाव', 'ફેરફારો'],
  'Customers': ['ग्राहक', 'ગ્રાહકો'],
  'Vendors': ['विक्रेता', 'વિક્રેતાઓ'],
  'Picking & Returns': ['पिकिंग और वापसी', 'પિકિંગ અને પરત'],
  'QC & Packing': ['जाँच और पैकिंग', 'ચકાસણી અને પૅકિંગ'],
  'Collection': ['कलेक्शन', 'કલેક્શન'],
  'Stylist dashboard': ['स्टाइलिस्ट डैशबोर्ड', 'સ્ટાઇલિસ્ટ ડૅશબોર્ડ'],
  'All assigned events': ['सभी सौंपे गए इवेंट', 'બધા સોંપાયેલા ઇવેન્ટ'],
  'Assigned events': ['सौंपे गए इवेंट', 'સોંપાયેલા ઇવેન્ટ'],
  'Stylist opportunities': ['स्टाइलिस्ट अवसर', 'સ્ટાઇલિસ્ટ તકો'],
  'My Tasks': ['मेरे कार्य', 'મારા કાર્યો'],
  'Attendance': ['उपस्थिति', 'હાજરી'],
  'Performance': ['प्रदर्शन', 'કામગીરી'],
  'Leave': ['छुट्टी', 'રજા'],
  'Notifications': ['सूचनाएँ', 'સૂચનાઓ'],
  'Reports': ['रिपोर्ट', 'અહેવાલો'],
  'Inventory': ['इन्वेंटरी', 'ઇન્વેન્ટરી'],
  'Packages': ['पैकेज', 'પૅકેજ'],
  'Customer Ledger': ['ग्राहक खाता', 'ગ્રાહક ખાતાવહી'],
  'Challans': ['चालान', 'ચલણ'],
  'Vouchers': ['वाउचर', 'વાઉચર'],
  'Expenses': ['खर्च', 'ખર્ચ'],
  'Accounts Portal': ['अकाउंट्स पोर्टल', 'એકાઉન્ટ્સ પોર્ટલ'],
  'Manager Portal': ['मैनेजर पोर्टल', 'મેનેજર પોર્ટલ'],
  'No department access': ['विभाग की अनुमति नहीं', 'વિભાગની પરવાનગી નથી'],
  'Log out': ['लॉग आउट', 'લૉગ આઉટ'],
  'Search': ['खोजें', 'શોધો'],
  'Save': ['सहेजें', 'સાચવો'],
  'Cancel': ['रद्द करें', 'રદ કરો'],
  'Close': ['बंद करें', 'બંધ કરો'],
  'Open': ['खोलें', 'ખોલો'],
  'View': ['देखें', 'જુઓ'],
  'Edit': ['संपादित करें', 'ફેરફાર કરો'],
  'Delete': ['हटाएँ', 'કાઢી નાખો'],
  'Submit': ['जमा करें', 'સબમિટ કરો'],
  'Confirm': ['पुष्टि करें', 'પુષ્ટિ કરો'],
  'Back': ['वापस', 'પાછા'],
  'Next': ['अगला', 'આગળ'],
  'Previous': ['पिछला', 'પાછળ'],
  'Refresh': ['रिफ्रेश करें', 'રિફ્રેશ કરો'],
  'Print': ['प्रिंट करें', 'પ્રિન્ટ કરો'],
  'Download': ['डाउनलोड करें', 'ડાઉનલોડ કરો'],
  'Upload': ['अपलोड करें', 'અપલોડ કરો'],
  'Details': ['विवरण', 'વિગતો'],
  'Status': ['स्थिति', 'સ્થિતિ'],
  'Date': ['तारीख', 'તારીખ'],
  'Time': ['समय', 'સમય'],
  'Customer': ['ग्राहक', 'ગ્રાહક'],
  'Booking': ['बुकिंग', 'બુકિંગ'],
  'Event': ['इवेंट', 'ઇવેન્ટ'],
  'Location': ['स्थान', 'સ્થળ'],
  'Amount': ['राशि', 'રકમ'],
  'Total': ['कुल', 'કુલ'],
  'Pending': ['लंबित', 'બાકી'],
  'Completed': ['पूरा हुआ', 'પૂર્ણ'],
  'Assigned': ['सौंपा गया', 'સોંપાયેલ'],
  'Awaiting': ['प्रतीक्षा में', 'રાહમાં'],
  'In progress': ['कार्य जारी है', 'કામ ચાલુ છે'],
  'Not started': ['शुरू नहीं हुआ', 'શરૂ થયું નથી'],
  'Blocked': ['रुका हुआ', 'અટકેલું'],
  'Confirmed': ['पुष्टि हुई', 'પુષ્ટિ થયેલ'],
  'Cancelled': ['रद्द हुआ', 'રદ થયેલ'],
  'Today': ['आज', 'આજે'],
  'Tomorrow': ['कल', 'આવતીકાલે'],
  'All': ['सभी', 'બધા'],
  'All statuses': ['सभी स्थितियाँ', 'બધી સ્થિતિઓ'],
  'All departments': ['सभी विभाग', 'બધા વિભાગો'],
  'All dates': ['सभी तारीखें', 'બધી તારીખો'],
  'Booking date': ['बुकिंग की तारीख', 'બુકિંગની તારીખ'],
  'Event date': ['इवेंट की तारीख', 'ઇવેન્ટની તારીખ'],
  'Search customer, booking, event, or location…': ['ग्राहक, बुकिंग, इवेंट या स्थान खोजें…', 'ગ્રાહક, બુકિંગ, ઇવેન્ટ અથવા સ્થળ શોધો…'],
  'Search job or event': ['जॉब या इवेंट खोजें', 'જોબ અથવા ઇવેન્ટ શોધો'],
  'Search name, booking…': ['नाम या बुकिंग खोजें…', 'નામ અથવા બુકિંગ શોધો…'],
  'No records found.': ['कोई रिकॉर्ड नहीं मिला।', 'કોઈ રેકોર્ડ મળ્યો નથી.'],
  'No jobs found.': ['कोई जॉब नहीं मिला।', 'કોઈ જોબ મળી નથી.'],
  'No results found.': ['कोई परिणाम नहीं मिला।', 'કોઈ પરિણામ મળ્યું નથી.'],
  'Warehouse': ['वेयरहाउस', 'વેરહાઉસ'],
  'Stylist': ['स्टाइलिस्ट', 'સ્ટાઇલિસ્ટ'],
  'Booking Dashboard': ['बुकिंग डैशबोर्ड', 'બુકિંગ ડૅશબોર્ડ'],
  'Bookings, quotations and jobs waiting for closure': ['बुकिंग, कोटेशन और बंद होने की प्रतीक्षा वाले जॉब', 'બુકિંગ, કોટેશન અને બંધ થવાની રાહ જોતા જોબ'],
  'Quick actions': ['त्वरित कार्य', 'ઝડપી કાર્યો'],
  'Recent bookings': ['हाल की बुकिंग', 'તાજેતરની બુકિંગ'],
  'Pick order items and send completed jobs to QC & Packing': ['ऑर्डर के सामान चुनें और पूरे जॉब जाँच व पैकिंग को भेजें', 'ઑર્ડરની વસ્તુઓ પસંદ કરો અને પૂર્ણ જોબ ચકાસણી અને પૅકિંગમાં મોકલો'],
  'Check and pack products prepared by Warehouse': ['वेयरहाउस से तैयार सामान की जाँच और पैकिंग करें', 'વેરહાઉસે તૈયાર કરેલી વસ્તુઓ તપાસો અને પૅક કરો'],
  'Collect rental products and hand them over safely': ['किराये का सामान प्राप्त करें और सुरक्षित रूप से सौंपें', 'ભાડાની વસ્તુઓ એકત્ર કરો અને સુરક્ષિત રીતે સોંપો'],
  'Open jobs': ['खुले जॉब', 'ખુલ્લા જોબ'],
  'Closed jobs': ['बंद जॉब', 'બંધ જોબ'],
  'Open warehouse jobs': ['खुले वेयरहाउस जॉब', 'ખુલ્લા વેરહાઉસ જોબ'],
  'warehouse jobs': ['वेयरहाउस जॉब', 'વેરહાઉસ જોબ'],
  'Open QC jobs': ['खुले जाँच जॉब', 'ખુલ્લા ચકાસણી જોબ'],
  'Closed QC': ['बंद जाँच', 'બંધ ચકાસણી'],
  'Closed': ['बंद', 'બંધ'],
  'jobs': ['जॉब', 'જોબ'],
  'job': ['जॉब', 'જોબ'],
  'Date not added': ['तारीख दर्ज नहीं', 'તારીખ ઉમેરાઈ નથી'],
  'Picking': ['पिकिंग', 'પિકિંગ'],
  'Return': ['वापसी', 'પરત'],
  'Repick needed': ['दोबारा पिकिंग चाहिए', 'ફરી પિકિંગ જરૂરી'],
  'No open warehouse jobs': ['कोई खुला वेयरहाउस जॉब नहीं', 'કોઈ ખુલ્લો વેરહાઉસ જોબ નથી'],
  'No closed warehouse jobs': ['कोई बंद वेयरहाउस जॉब नहीं', 'કોઈ બંધ વેરહાઉસ જોબ નથી'],
  'No open QC jobs': ['कोई खुला जाँच जॉब नहीं', 'કોઈ ખુલ્લો ચકાસણી જોબ નથી'],
  'No closed QC jobs': ['कोई बंद जाँच जॉब नहीं', 'કોઈ બંધ ચકાસણી જોબ નથી'],
  'No open collection jobs': ['कोई खुला कलेक्शन जॉब नहीं', 'કોઈ ખુલ્લો કલેક્શન જોબ નથી'],
  'No closed collection jobs': ['कोई बंद कलेक्शन जॉब नहीं', 'કોઈ બંધ કલેક્શન જોબ નથી'],
  'Confirmed sale and rental jobs will appear here for picking.': ['पिकिंग के लिए पुष्टि किए गए बिक्री और किराये के जॉब यहाँ दिखेंगे।', 'પિકિંગ માટે પુષ્ટિ થયેલા વેચાણ અને ભાડાના જોબ અહીં દેખાશે.'],
  'Completed picking jobs will appear here.': ['पूरे हुए पिकिंग जॉब यहाँ दिखेंगे।', 'પૂર્ણ થયેલા પિકિંગ જોબ અહીં દેખાશે.'],
  'Event assignment overview': ['इवेंट असाइनमेंट का सारांश', 'ઇવેન્ટ સોંપણીનો સારાંશ'],
  'Stylist workload': ['स्टाइलिस्ट का कार्यभार', 'સ્ટાઇલિસ્ટનું કામનું ભારણ'],
  'Your Safawala staff portal': ['आपका सफावाला स्टाफ पोर्टल', 'તમારું સફાવાલા સ્ટાફ પોર્ટલ'],
  'Access not granted': ['प्रवेश की अनुमति नहीं', 'પ્રવેશની મંજૂરી નથી'],
  'No active department is assigned to this staff account.': ['इस स्टाफ खाते को कोई सक्रिय विभाग नहीं सौंपा गया है।', 'આ સ્ટાફ ખાતાને કોઈ સક્રિય વિભાગ સોંપાયેલો નથી.'],
  'Jobs in your queue': ['आपकी सूची के जॉब', 'તમારી યાદીના જોબ'],
  'Jobs to close': ['बंद करने वाले जॉब', 'બંધ કરવાના જોબ'],
  'Booking checks & closure': ['बुकिंग जाँच और समापन', 'બુકિંગ ચકાસણી અને પૂર્ણતા'],
  'Check & Close': ['जाँचें और बंद करें', 'ચકાસો અને બંધ કરો'],
  'Open Modifications': ['खुले बदलाव', 'ખુલ્લા ફેરફારો'],
  'Modification work queue': ['बदलाव कार्य सूची', 'ફેરફાર કાર્ય યાદી'],
  'Modifications pending': ['लंबित बदलाव', 'બાકી ફેરફારો'],
  'New Booking': ['नई बुकिंग', 'નવી બુકિંગ'],
  'All bookings': ['सभी बुकिंग', 'બધી બુકિંગ'],
  'Event / customer': ['इवेंट / ग्राहक', 'ઇવેન્ટ / ગ્રાહક'],
  'Event details': ['इवेंट विवरण', 'ઇવેન્ટની વિગતો'],
  'Date and time': ['तारीख और समय', 'તારીખ અને સમય'],
  'Event-day status': ['इवेंट-दिन की स्थिति', 'ઇવેન્ટ દિવસની સ્થિતિ'],
  'Live event': ['लाइव इवेंट', 'ચાલુ ઇવેન્ટ'],
  'Assigned stylists': ['सौंपे गए स्टाइलिस्ट', 'સોંપાયેલા સ્ટાઇલિસ્ટ'],
  'No stylist assigned': ['कोई स्टाइलिस्ट नहीं सौंपा गया', 'કોઈ સ્ટાઇલિસ્ટ સોંપાયેલ નથી'],
  'Stylist requirement': ['स्टाइलिस्ट की आवश्यकता', 'સ્ટાઇલિસ્ટની જરૂરિયાત'],
  'Available for this event?': ['इस इवेंट के लिए उपलब्ध हैं?', 'આ ઇવેન્ટ માટે ઉપલબ્ધ છો?'],
  'No active stylists found.': ['कोई सक्रिय स्टाइलिस्ट नहीं मिला।', 'કોઈ સક્રિય સ્ટાઇલિસ્ટ મળ્યો નથી.'],
  'No approved assignments yet': ['अभी कोई स्वीकृत असाइनमेंट नहीं', 'હજુ કોઈ મંજૂર સોંપણી નથી'],
  'No open styling opportunities right now': ['अभी कोई खुला स्टाइलिंग अवसर नहीं', 'હાલ કોઈ ખુલ્લી સ્ટાઇલિંગ તક નથી'],
  'No stylist events yet.': ['अभी कोई स्टाइलिस्ट इवेंट नहीं।', 'હજુ કોઈ સ્ટાઇલિસ્ટ ઇવેન્ટ નથી.'],
  'No events to track': ['ट्रैक करने के लिए कोई इवेंट नहीं', 'ટ્રૅક કરવા કોઈ ઇવેન્ટ નથી'],
  'No assigned leads': ['कोई सौंपा गया लीड नहीं', 'કોઈ સોંપાયેલ લીડ નથી'],
  'No pending tasks': ['कोई लंबित कार्य नहीं', 'કોઈ બાકી કાર્ય નથી'],
  'No jobs are waiting': ['कोई जॉब प्रतीक्षा में नहीं', 'કોઈ જોબ રાહમાં નથી'],
  'No jobs waiting for your department right now.': ['आपके विभाग के लिए अभी कोई जॉब प्रतीक्षा में नहीं है।', 'તમારા વિભાગ માટે હાલમાં કોઈ જોબ રાહમાં નથી.'],
  'No bookings available.': ['कोई बुकिंग उपलब्ध नहीं।', 'કોઈ બુકિંગ ઉપલબ્ધ નથી.'],
  'No invoices available': ['कोई इनवॉइस उपलब्ध नहीं', 'કોઈ ઇન્વૉઇસ ઉપલબ્ધ નથી'],
  'No notifications yet': ['अभी कोई सूचना नहीं', 'હજુ કોઈ સૂચના નથી'],
  'No picked rental products are available for quality checking.': ['गुणवत्ता जाँच के लिए चुना गया किराये का सामान उपलब्ध नहीं है।', 'ગુણવત્તા ચકાસણી માટે પસંદ કરેલી ભાડાની વસ્તુઓ ઉપલબ્ધ નથી.'],
  'Mark all read': ['सभी पढ़े हुए चिह्नित करें', 'બધું વાંચેલું ચિહ્નિત કરો'],
  'Items per page': ['प्रति पृष्ठ आइटम', 'દર પૃષ્ઠે વસ્તુઓ'],
  'Showing': ['दिखा रहा है', 'દર્શાવે છે'],
  'View details': ['विवरण देखें', 'વિગતો જુઓ'],
  'View all': ['सभी देखें', 'બધું જુઓ'],
  'View current progress': ['वर्तमान प्रगति देखें', 'હાલની પ્રગતિ જુઓ'],
  'View / download ticket': ['टिकट देखें / डाउनलोड करें', 'ટિકિટ જુઓ / ડાઉનલોડ કરો'],
  'Track this job': ['इस जॉब को ट्रैक करें', 'આ જોબ ટ્રૅક કરો'],
  'Track': ['ट्रैक करें', 'ટ્રૅક કરો'],
  'Products to pick': ['चुनने वाले उत्पाद', 'પસંદ કરવાની વસ્તુઓ'],
  'Quality check': ['गुणवत्ता जाँच', 'ગુણવત્તા ચકાસણી'],
  'Quality check completed': ['गुणवत्ता जाँच पूरी हुई', 'ગુણવત્તા ચકાસણી પૂર્ણ'],
  'Packing': ['पैकिंग', 'પૅકિંગ'],
  'Packing completed': ['पैकिंग पूरी हुई', 'પૅકિંગ પૂર્ણ'],
  'Picking completed': ['पिकिंग पूरी हुई', 'પિકિંગ પૂર્ણ'],
  'Packing proof': ['पैकिंग का प्रमाण', 'પૅકિંગનો પુરાવો'],
  'Packing proof photos': ['पैकिंग प्रमाण की तस्वीरें', 'પૅકિંગ પુરાવાના ફોટા'],
  'Submit quality check': ['गुणवत्ता जाँच जमा करें', 'ગુણવત્તા ચકાસણી સબમિટ કરો'],
  'Verify & complete packing': ['जाँचें और पैकिंग पूरी करें', 'ચકાસો અને પૅકિંગ પૂર્ણ કરો'],
  'Complete picking & send to QC': ['पिकिंग पूरी कर जाँच को भेजें', 'પિકિંગ પૂર્ણ કરી ચકાસણીમાં મોકલો'],
  'Complete collection & hand over': ['कलेक्शन पूरा कर सौंपें', 'કલેક્શન પૂર્ણ કરી સોંપો'],
  'Confirm receiving & send to Booking': ['प्राप्ति की पुष्टि कर बुकिंग को भेजें', 'પ્રાપ્તીની પુષ્ટિ કરી બુકિંગમાં મોકલો'],
  'Warehouse receiving': ['वेयरहाउस में प्राप्ति', 'વેરહાઉસમાં પ્રાપ્તી'],
  'Return QC': ['वापसी जाँच', 'પરત ચકાસણી'],
  'Return quality check': ['वापसी गुणवत्ता जाँच', 'પરત ગુણવત્તા ચકાસણી'],
  'Return QC completed': ['वापसी जाँच पूरी हुई', 'પરત ચકાસણી પૂર્ણ'],
  'Return receiving completed': ['वापसी प्राप्ति पूरी हुई', 'પરત પ્રાપ્તી પૂર્ણ'],
  'Return Warehouse — inventory disposition': ['वापसी वेयरहाउस — इन्वेंटरी निपटान', 'પરત વેરહાઉસ — ઇન્વેન્ટરી વ્યવસ્થા'],
  'Collected quantity': ['प्राप्त मात्रा', 'એકત્ર કરેલી સંખ્યા'],
  'Rental quantity': ['किराये की मात्रा', 'ભાડાની સંખ્યા'],
  'Good quantity': ['सही मात्रा', 'સારી સંખ્યા'],
  'Damaged quantity': ['क्षतिग्रस्त मात्रा', 'નુકસાન થયેલી સંખ્યા'],
  'Missing quantity': ['गुम मात्रा', 'ગુમ થયેલી સંખ્યા'],
  'Damaged / repair': ['क्षतिग्रस्त / मरम्मत', 'નુકસાન / સમારકામ'],
  'Missing / lost': ['गुम / खोया', 'ગુમ / ખોવાયેલ'],
  'Repair required': ['मरम्मत आवश्यक', 'સમારકામ જરૂરી'],
  'Usable': ['उपयोग योग्य', 'વાપરવા યોગ્ય'],
  'Unusable': ['उपयोग योग्य नहीं', 'વાપરવા યોગ્ય નથી'],
  'Wrong product': ['गलत उत्पाद', 'ખોટી વસ્તુ'],
  'Payment': ['भुगतान', 'ચુકવણી'],
  'Payment pending': ['भुगतान लंबित', 'ચુકવણી બાકી'],
  'Payment is complete — nothing pending': ['भुगतान पूरा है — कुछ लंबित नहीं', 'ચુકવણી પૂર્ણ છે — કંઈ બાકી નથી'],
  'Deposit:': ['जमा राशि:', 'જમા રકમ:'],
  'Pending balance:': ['बकाया राशि:', 'બાકી રકમ:'],
  'Final payment collected': ['अंतिम भुगतान प्राप्त', 'અંતિમ ચુકવણી મળી'],
  'Additional payment collected:': ['अतिरिक्त भुगतान प्राप्त:', 'વધારાની ચુકવણી મળી:'],
  'Amount received:': ['प्राप्त राशि:', 'મળેલી રકમ:'],
  'Refund issued:': ['रिफंड जारी:', 'રિફંડ આપ્યું:'],
  'Rental': ['किराया', 'ભાડું'],
  'A job appears here after Return Warehouse is completed.': ['वापसी वेयरहाउस पूरा होने पर जॉब यहाँ दिखेगा।', 'પરત વેરહાઉસ પૂર્ણ થયા પછી જોબ અહીં દેખાશે.'],
  'Access is granted by your admin from Manage Access': ['प्रवेश की अनुमति एडमिन द्वारा मैनेज एक्सेस से दी जाती है', 'પ્રવેશની પરવાનગી એડમિન મેનેજ ઍક્સેસમાંથી આપે છે'],
  'All listed quantities were checked and placed in the recorded locations.': ['सूची की सभी मात्राएँ जाँचकर दर्ज स्थानों पर रखी गईं।', 'યાદીની બધી સંખ્યા તપાસીને નોંધાયેલા સ્થળોએ મૂકાઈ.'],
  'Assigned department work will appear here.': ['सौंपे गए विभाग का कार्य यहाँ दिखेगा।', 'સોંપાયેલા વિભાગનું કામ અહીં દેખાશે.'],
  'Assignments across all active stylists.': ['सभी सक्रिय स्टाइलिस्ट के असाइनमेंट।', 'બધા સક્રિય સ્ટાઇલિસ્ટની સોંપણીઓ.'],
  'Attendance module access is active.': ['उपस्थिति मॉड्यूल का प्रवेश सक्रिय है।', 'હાજરી મોડ્યુલનો પ્રવેશ સક્રિય છે.'],
  'Closing...': ['बंद किया जा रहा है...', 'બંધ થઈ રહ્યું છે...'],
  'Closure notes (optional)': ['समापन नोट (वैकल्पिक)', 'પૂર્ણતા નોંધ (વૈકલ્પિક)'],
  'Collect rental products': ['किराये का सामान प्राप्त करें', 'ભાડાની વસ્તુઓ એકત્ર કરો'],
  'Collected from': ['किससे प्राप्त हुआ', 'કોની પાસેથી મેળવ્યું'],
  'Collection handed over': ['कलेक्शन सौंप दिया गया', 'કલેક્શન સોંપાયું'],
  'Collection handover': ['कलेक्शन हस्तांतरण', 'કલેક્શન હસ્તાંતરણ'],
  'Complete all checks and add at least one proof photo.': ['सभी जाँच पूरी करें और कम से कम एक प्रमाण फोटो जोड़ें।', 'બધી ચકાસણી પૂર્ણ કરો અને ઓછામાં ઓછો એક પુરાવાનો ફોટો ઉમેરો.'],
  'Complete the checklist and add proof before dispatch.': ['भेजने से पहले चेकलिस्ट पूरी करें और प्रमाण जोड़ें।', 'મોકલતા પહેલાં ચેકલિસ્ટ પૂર્ણ કરો અને પુરાવો ઉમેરો.'],
  'Completed-event credits': ['पूरे हुए इवेंट के क्रेडिट', 'પૂર્ણ થયેલા ઇવેન્ટના ક્રેડિટ'],
  'Confirmed booking jobs will appear here automatically.': ['पुष्टि किए गए बुकिंग जॉब यहाँ अपने आप दिखेंगे।', 'પુષ્ટિ થયેલા બુકિંગ જોબ અહીં આપમેળે દેખાશે.'],
  'Damage / Missing': ['नुकसान / गुम', 'નુકસાન / ગુમ'],
  'Damage/loss amount (if any) has been reviewed and acknowledged': ['नुकसान/गुम राशि (यदि हो) की समीक्षा और पुष्टि की गई है', 'નુકસાન/ગુમ રકમ (જો હોય) તપાસી અને સ્વીકારી છે'],
  'Damaged (from Return QC)': ['क्षतिग्रस्त (वापसी जाँच से)', 'નુકસાન થયેલું (પરત ચકાસણીમાંથી)'],
  'Event completed': ['इवेंट पूरा हुआ', 'ઇવેન્ટ પૂર્ણ'],
  'events': ['इवेंट', 'ઇવેન્ટ'],
  'Filter event date': ['इवेंट तारीख फ़िल्टर करें', 'ઇવેન્ટ તારીખ ફિલ્ટર કરો'],
  'Handed over to': ['किसे सौंपा', 'કોને સોંપ્યું'],
  'Handover note (optional)': ['हस्तांतरण नोट (वैकल्पिक)', 'હસ્તાંતરણ નોંધ (વૈકલ્પિક)'],
  'I confirm these products were handed over to the showroom or authorized receiver.': ['मैं पुष्टि करता/करती हूँ कि यह सामान शोरूम या अधिकृत प्राप्तकर्ता को सौंपा गया।', 'હું પુષ્ટિ કરું છું કે આ વસ્તુઓ શોરૂમ અથવા અધિકૃત પ્રાપ્તકર્તાને સોંપાઈ.'],
  'Invoices for assigned confirmed bookings will appear here.': ['सौंपी गई पुष्टि वाली बुकिंग के इनवॉइस यहाँ दिखेंगे।', 'સોંપાયેલી પુષ્ટિ થયેલી બુકિંગના ઇન્વૉઇસ અહીં દેખાશે.'],
  'Issue': ['समस्या', 'સમસ્યા'],
  'Issue proof photos': ['समस्या के प्रमाण फोटो', 'સમસ્યાના પુરાવાના ફોટા'],
  'Issue reference (optional)': ['समस्या संदर्भ (वैकल्पिक)', 'સમસ્યાનો સંદર્ભ (વૈકલ્પિક)'],
  'Issue reference (required if there is damage)': ['समस्या संदर्भ (नुकसान होने पर आवश्यक)', 'સમસ્યાનો સંદર્ભ (નુકસાન હોય તો જરૂરી)'],
  'Issue remark': ['समस्या टिप्पणी', 'સમસ્યાની નોંધ'],
  'Kept by customer': ['ग्राहक के पास रखा', 'ગ્રાહક પાસે રાખ્યું'],
  'Latest records from the database.': ['डेटाबेस के नवीनतम रिकॉर्ड।', 'ડેટાબેઝના તાજેતરના રેકોર્ડ.'],
  'Login ID': ['लॉगिन आईडी', 'લૉગિન આઈડી'],
  'Mark each product after it is picked from the warehouse.': ['वेयरहाउस से चुनने के बाद हर उत्पाद को चिह्नित करें।', 'વેરહાઉસમાંથી પસંદ કર્યા પછી દરેક વસ્તુને ચિહ્નિત કરો.'],
  'Missing (from Collection)': ['गुम (कलेक्शन से)', 'ગુમ (કલેક્શનમાંથી)'],
  'Navigation': ['नेविगेशन', 'નેવિગેશન'],
  'New assigned booking enquiries will appear here.': ['नई सौंपी गई बुकिंग पूछताछ यहाँ दिखेंगी।', 'નવી સોંપાયેલી બુકિંગ પૂછપરછ અહીં દેખાશે.'],
  'New confirmed bookings that need a stylist will appear here.': ['स्टाइलिस्ट चाहिए ऐसी नई पुष्टि वाली बुकिंग यहाँ दिखेंगी।', 'સ્ટાઇલિસ્ટ જરૂરી હોય એવી નવી પુષ્ટિ થયેલી બુકિંગ અહીં દેખાશે.'],
  'No Return QC results were found for this job yet, so there is nothing to sort here.': ['इस जॉब की वापसी जाँच अभी नहीं मिली, इसलिए छाँटने के लिए कुछ नहीं है।', 'આ જોબની પરત ચકાસણી હજુ મળી નથી, તેથી ગોઠવવા કંઈ નથી.'],
  'No returned items were recorded at Collection, so there is nothing to check here.': ['कलेक्शन में कोई लौटाया सामान दर्ज नहीं है, इसलिए जाँचने के लिए कुछ नहीं है।', 'કલેક્શનમાં કોઈ પરત આવેલી વસ્તુ નોંધાઈ નથી, તેથી તપાસવા કંઈ નથી.'],
  'Nothing damaged.': ['कुछ भी क्षतिग्रस्त नहीं।', 'કંઈ નુકસાન થયું નથી.'],
  'Nothing missing.': ['कुछ भी गुम नहीं।', 'કંઈ ગુમ નથી.'],
  'Once admin approves your interest in an event, it will appear here.': ['एडमिन द्वारा आपकी रुचि मंजूर होने पर इवेंट यहाँ दिखेगा।', 'એડમિન તમારી રુચિ મંજૂર કરે પછી ઇવેન્ટ અહીં દેખાશે.'],
  'Open sale-booking requests, update their progress, and mark completed work.': ['खुले बिक्री-बुकिंग अनुरोध देखें, प्रगति अपडेट करें और पूरा कार्य चिह्नित करें।', 'ખુલ્લી વેચાણ-બુકિંગ વિનંતીઓ જુઓ, પ્રગતિ અપડેટ કરો અને પૂર્ણ કામ ચિહ્નિત કરો.'],
  'Open the modules you manage most often.': ['जिन मॉड्यूल को आप अधिक संभालते हैं, उन्हें खोलें।', 'તમે વધુ સંભાળો છો તે મોડ્યુલ ખોલો.'],
  'Operations': ['संचालन', 'કામકાજ'],
  'Pass or flag every picked product.': ['हर चुने गए उत्पाद को पास या फ़्लैग करें।', 'દરેક પસંદ કરેલી વસ્તુ પાસ કરો અથવા ચિહ્નિત કરો.'],
  'Payment details are not available for this job.': ['इस जॉब के भुगतान विवरण उपलब्ध नहीं हैं।', 'આ જોબની ચુકવણીની વિગતો ઉપલબ્ધ નથી.'],
  'Physical receiving confirmed': ['सामान प्राप्ति की पुष्टि हुई', 'વસ્તુઓ મળ્યાની પુષ્ટિ થઈ'],
  'Received from': ['किससे प्राप्त हुआ', 'કોની પાસેથી મળ્યું'],
  'Receiving note (optional)': ['प्राप्ति नोट (वैकल्पिक)', 'પ્રાપ્તીની નોંધ (વૈકલ્પિક)'],
  'Record the pickup and showroom handover before sending the job to Return QC.': ['जॉब को वापसी जाँच में भेजने से पहले पिकअप और शोरूम हस्तांतरण दर्ज करें।', 'જોબને પરત ચકાસણીમાં મોકલતા પહેલાં પિકઅપ અને શોરૂમ હસ્તાંતરણ નોંધો.'],
  'Refund issued (if any)': ['रिफंड जारी (यदि हो)', 'રિફંડ આપ્યું (જો હોય)'],
  'Remarks (optional)': ['टिप्पणी (वैकल्पिक)', 'નોંધ (વૈકલ્પિક)'],
  'Remarks (required for damaged or missing items)': ['टिप्पणी (क्षतिग्रस्त या गुम सामान के लिए आवश्यक)', 'નોંધ (નુકસાન થયેલી અથવા ગુમ વસ્તુઓ માટે જરૂરી)'],
  'Remarks (required if there is a problem)': ['टिप्पणी (समस्या होने पर आवश्यक)', 'નોંધ (સમસ્યા હોય તો જરૂરી)'],
  'Rental collection': ['किराये के सामान का कलेक्शन', 'ભાડાની વસ્તુઓનું કલેક્શન'],
  'Return rejected items to warehouse': ['अस्वीकृत सामान वेयरहाउस लौटाएँ', 'નકારેલી વસ્તુઓ વેરહાઉસમાં પરત કરો'],
  'Review every product to continue.': ['आगे बढ़ने के लिए हर उत्पाद की समीक्षा करें।', 'આગળ વધવા દરેક વસ્તુની સમીક્ષા કરો.'],
  'Security deposit has been settled': ['सिक्योरिटी डिपॉजिट का निपटान हो गया', 'સિક્યોરિટી ડિપૉઝિટનું સમાધાન થયું'],
  'See who is assigned, what is still open, and the current event status.': ['देखें किसे काम सौंपा गया है, क्या खुला है और इवेंट की वर्तमान स्थिति क्या है।', 'જુઓ કોને કામ સોંપાયું છે, શું બાકી છે અને ઇવેન્ટની હાલની સ્થિતિ શું છે.'],
  'Select at least one picked product to continue.': ['आगे बढ़ने के लिए कम से कम एक चुना उत्पाद चुनें।', 'આગળ વધવા ઓછામાં ઓછી એક પસંદ કરેલી વસ્તુ પસંદ કરો.'],
  'Sent back by Quality Check': ['गुणवत्ता जाँच से वापस भेजा गया', 'ગુણવત્તા ચકાસણીમાંથી પાછું મોકલાયું'],
  'Sent back to Warehouse': ['वेयरहाउस वापस भेजा गया', 'વેરહાઉસમાં પાછું મોકલાયું'],
  'Staff account': ['स्टाफ खाता', 'સ્ટાફ ખાતું'],
  'Staff Portal': ['स्टाफ पोर्टल', 'સ્ટાફ પોર્ટલ'],
  'Storage / rack location': ['भंडारण / रैक स्थान', 'સંગ્રહ / રૅક સ્થાન'],
  'Submit once for admin review.': ['एडमिन की समीक्षा के लिए एक बार जमा करें।', 'એડમિનની સમીક્ષા માટે એક વખત સબમિટ કરો.'],
  'Submit once. Admin will review all interested stylists.': ['एक बार जमा करें। एडमिन सभी इच्छुक स्टाइलिस्ट की समीक्षा करेगा।', 'એક વખત સબમિટ કરો. એડમિન બધા રસ ધરાવતા સ્ટાઇલિસ્ટની સમીક્ષા કરશે.'],
  'Submitting...': ['जमा किया जा रहा है...', 'સબમિટ થઈ રહ્યું છે...'],
  'This rental booking has no products to pick.': ['इस किराये की बुकिंग में चुनने के लिए कोई उत्पाद नहीं है।', 'આ ભાડાની બુકિંગમાં પસંદ કરવા કોઈ વસ્તુ નથી.'],
  'This rental job has no products recorded for collection.': ['इस किराये के जॉब में कलेक्शन के लिए कोई उत्पाद दर्ज नहीं है।', 'આ ભાડાના જોબમાં કલેક્શન માટે કોઈ વસ્તુ નોંધાઈ નથી.'],
  'Total credited event assignments': ['कुल क्रेडिट वाले इवेंट असाइनमेंट', 'કુલ ક્રેડિટ થયેલી ઇવેન્ટ સોંપણીઓ'],
  'Useful event information': ['उपयोगी इवेंट जानकारी', 'ઉપયોગી ઇવેન્ટ માહિતી'],
  'Visible damage': ['दिखने वाला नुकसान', 'દેખાતું નુકસાન'],
  'A simple view of your modification work': ['आपके बदलाव कार्य का सरल दृश्य', 'તમારા ફેરફારના કામનું સરળ દૃશ્ય'],
  'Agreements shared with your staff account': ['आपके स्टाफ खाते से साझा किए गए समझौते', 'તમારા સ્ટાફ ખાતા સાથે શેર થયેલા કરારો'],
  'Any additional notes…': ['कोई अतिरिक्त नोट…', 'કોઈ વધારાની નોંધ…'],
  'Any handover note': ['कोई हस्तांतरण नोट', 'કોઈ હસ્તાંતરણ નોંધ'],
  'Anything the event team should know…': ['इवेंट टीम को जानने योग्य जानकारी…', 'ઇવેન્ટ ટીમે જાણવાની માહિતી…'],
  'Anything worth recording about this closure…': ['इस समापन के बारे में दर्ज करने योग्य जानकारी…', 'આ પૂર્ણતા વિશે નોંધવા જેવી માહિતી…'],
  'Booking enquiries assigned to your department access': ['आपके विभाग को सौंपी गई बुकिंग पूछताछ', 'તમારા વિભાગને સોંપાયેલી બુકિંગ પૂછપરછ'],
  'Booking invoices available to your account': ['आपके खाते में उपलब्ध बुकिंग इनवॉइस', 'તમારા ખાતામાં ઉપલબ્ધ બુકિંગ ઇન્વૉઇસ'],
  'Check the current progress of every confirmed event': ['हर पुष्टि किए गए इवेंट की वर्तमान प्रगति देखें', 'દરેક પુષ્ટિ થયેલી ઇવેન્ટની હાલની પ્રગતિ જુઓ'],
  'Check the final payment and close completed rental jobs': ['अंतिम भुगतान जाँचें और पूरे हुए किराये के जॉब बंद करें', 'અંતિમ ચુકવણી તપાસો અને પૂર્ણ થયેલા ભાડાના જોબ બંધ કરો'],
  'Close event details': ['इवेंट विवरण बंद करें', 'ઇવેન્ટ વિગતો બંધ કરો'],
  'Close job details': ['जॉब विवरण बंद करें', 'જોબ વિગતો બંધ કરો'],
  'Close job tracker': ['जॉब ट्रैकर बंद करें', 'જોબ ટ્રૅકર બંધ કરો'],
  'Collection job': ['कलेक्शन जॉब', 'કલેક્શન જોબ'],
  'Completed-event credits and personal progress': ['पूरे इवेंट के क्रेडिट और व्यक्तिगत प्रगति', 'પૂર્ણ ઇવેન્ટના ક્રેડિટ અને વ્યક્તિગત પ્રગતિ'],
  'Customer or venue representative': ['ग्राहक या स्थल प्रतिनिधि', 'ગ્રાહક અથવા સ્થળનો પ્રતિનિધિ'],
  'Describe the damage or condition…': ['नुकसान या स्थिति का वर्णन करें…', 'નુકસાન અથવા સ્થિતિ વર્ણવો…'],
  'Filter booking date': ['बुकिंग तारीख फ़िल्टर करें', 'બુકિંગ તારીખ ફિલ્ટર કરો'],
  'Leave Management': ['छुट्टी प्रबंधन', 'રજા વ્યવસ્થાપન'],
  'Log out of the staff portal': ['स्टाफ पोर्टल से लॉग आउट करें', 'સ્ટાફ પોર્ટલમાંથી લૉગ આઉટ કરો'],
  'Modification Dashboard': ['बदलाव डैशबोर्ड', 'ફેરફાર ડૅશબોર્ડ'],
  'My Agreements': ['मेरे समझौते', 'મારા કરારો'],
  'My Attendance': ['मेरी उपस्थिति', 'મારી હાજરી'],
  'My Invoices': ['मेरे इनवॉइस', 'મારા ઇન્વૉઇસ'],
  'My Leads': ['मेरे लीड', 'મારા લીડ'],
  'My Performance': ['मेरा प्रदर्शन', 'મારી કામગીરી'],
  'Open navigation': ['नेविगेशन खोलें', 'નેવિગેશન ખોલો'],
  'Operational work assigned to you or your department': ['आपको या आपके विभाग को सौंपा गया कार्य', 'તમને અથવા તમારા વિભાગને સોંપાયેલું કામ'],
  'Photo name, link, or reference': ['फोटो का नाम, लिंक या संदर्भ', 'ફોટાનું નામ, લિંક અથવા સંદર્ભ'],
  'Primary navigation': ['मुख्य नेविगेशन', 'મુખ્ય નેવિગેશન'],
  'QC & Packing job': ['जाँच और पैकिंग जॉब', 'ચકાસણી અને પૅકિંગ જોબ'],
  'QC job details': ['जाँच जॉब विवरण', 'ચકાસણી જોબ વિગતો'],
  'QC staff / authorized person': ['जाँच स्टाफ / अधिकृत व्यक्ति', 'ચકાસણી સ્ટાફ / અધિકૃત વ્યક્તિ'],
  'Required when anything is missing, damaged, held, or incorrect': ['कुछ गुम, क्षतिग्रस्त, रोका गया या गलत होने पर आवश्यक', 'કંઈ ગુમ, નુકસાન પામેલું, અટકાવેલું અથવા ખોટું હોય તો જરૂરી'],
  'Short damage or repair reference': ['नुकसान या मरम्मत का संक्षिप्त संदर्भ', 'નુકસાન અથવા સમારકામનો ટૂંકો સંદર્ભ'],
  'Short issue note': ['समस्या का संक्षिप्त नोट', 'સમસ્યાની ટૂંકી નોંધ'],
  'Showroom or authorized person': ['शोरूम या अधिकृत व्यक्ति', 'શોરૂમ અથવા અધિકૃત વ્યક્તિ'],
  'Sort jobs': ['जॉब क्रमबद्ध करें', 'જોબ ગોઠવો'],
  'Sort jobs by': ['जॉब क्रमबद्ध करने का आधार', 'જોબ ગોઠવવાનો આધાર'],
  'Stylist event details': ['स्टाइलिस्ट इवेंट विवरण', 'સ્ટાઇલિસ્ટ ઇવેન્ટ વિગતો'],
  'Updates about jobs in your departments': ['आपके विभाग के जॉब की जानकारी', 'તમારા વિભાગના જોબની માહિતી'],
  'View your department leave access': ['अपने विभाग की छुट्टी पहुँच देखें', 'તમારા વિભાગની રજા સુવિધા જુઓ'],
  'Warehouse job': ['वेयरहाउस जॉब', 'વેરહાઉસ જોબ'],
  'Warehouse job details': ['वेयरहाउस जॉब विवरण', 'વેરહાઉસ જોબ વિગતો'],
  'Your attendance access and daily status': ['आपकी उपस्थिति पहुँच और दैनिक स्थिति', 'તમારી હાજરી સુવિધા અને દૈનિક સ્થિતિ'],
  'Create Booking': ['बुकिंग बनाएँ', 'બુકિંગ બનાવો'],
  'Coupons & Offers': ['कूपन और ऑफर', 'કૂપન અને ઑફર'],
  'Leads': ['लीड', 'લીડ'],
  'Stylist Approvals': ['स्टाइलिस्ट स्वीकृतियाँ', 'સ્ટાઇલિસ્ટ મંજૂરીઓ'],
  'Travel Manager': ['यात्रा प्रबंधक', 'પ્રવાસ વ્યવસ્થાપક'],
  'Job Tracking': ['जॉब ट्रैकिंग', 'જોબ ટ્રૅકિંગ'],
  'Product Archive': ['उत्पाद संग्रह', 'ઉત્પાદન સંગ્રહ'],
  'Package Manager': ['पैकेज प्रबंधक', 'પૅકેજ વ્યવસ્થાપક'],
  'Laundry': ['लॉन्ड्री', 'લૉન્ડ્રી'],
  'HR & Staff': ['एचआर और स्टाफ', 'એચઆર અને સ્ટાફ'],
  'Settings': ['सेटिंग', 'સેટિંગ્સ'],
  'Overview': ['सारांश', 'ઝાંખી'],
  'Bookings & Sales': ['बुकिंग और बिक्री', 'બુકિંગ અને વેચાણ'],
  'Finance & Operations': ['वित्त और संचालन', 'નાણાં અને કામકાજ'],
  'Team & HR': ['टीम और एचआर', 'ટીમ અને એચઆર'],
  'System': ['सिस्टम', 'સિસ્ટમ'],
};

function translated(value: string, language: StaffLanguage) {
  if (language === 'en') return value;
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(value);
  if (!match) return value;
  if (match[2].startsWith('Welcome, ')) {
    const suffixes: Record<string, [string, string]> = {
      ' · Finance and customer accounts': [' · वित्त और ग्राहक खाते', ' · નાણાં અને ગ્રાહક ખાતા'],
      ' · Business operations overview': [' · व्यावसायिक संचालन सारांश', ' · વ્યવસાયિક કામકાજની ઝાંખી'],
    };
    const suffix = Object.keys(suffixes).find((item) => match[2].endsWith(item)) ?? '';
    const name = match[2].slice('Welcome, '.length, suffix ? -suffix.length : undefined);
    const greeting = language === 'hi' ? 'स्वागत है, ' : 'સ્વાગત છે, ';
    const translatedSuffix = suffix ? suffixes[suffix][language === 'hi' ? 0 : 1] : '';
    return `${match[1]}${greeting}${name}${translatedSuffix}${match[3]}`;
  }
  const entry = translations[match[2]];
  return entry ? `${match[1]}${entry[language === 'hi' ? 0 : 1]}${match[3]}` : value;
}

type LanguageContextValue = {
  language: StaffLanguage;
  setLanguage: (language: StaffLanguage) => Promise<boolean>;
  saving: boolean;
  error: string;
  t: (value: string) => string;
};

const StaffLanguageContext = createContext<LanguageContextValue | null>(null);

export function useStaffLanguage() {
  const context = useContext(StaffLanguageContext);
  if (!context) throw new Error('Staff language context is unavailable');
  return context;
}

export function StaffLanguageProvider({ initialLanguage, children }: { initialLanguage: StaffLanguage; children: ReactNode }) {
  const [language, updateLanguage] = useState(initialLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const originals = useRef(new WeakMap<Text, { original: string; last: string }>());
  const attributeOriginals = useRef(new WeakMap<Element, Map<string, { original: string; last: string }>>());

  const setLanguage = useCallback(async (next: StaffLanguage) => {
    if (next === language) return true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/staff-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: next }),
      });
      if (!response.ok) throw new Error('Unable to save your language. Please try again.');
      updateLanguage(next);
      return true;
    } catch {
      setError(language === 'hi' ? 'भाषा सहेजी नहीं जा सकी। दोबारा कोशिश करें।' : language === 'gu' ? 'ભાષા સાચવી શકાઈ નથી. ફરી પ્રયત્ન કરો.' : 'Unable to save language. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [language]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const translateNode = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, textarea, [contenteditable="true"], [data-no-translate]')) return;
      const current = node.nodeValue ?? '';
      let record = originals.current.get(node);
      if (!record || (current !== record.last && current !== record.original)) {
        record = { original: current, last: current };
        originals.current.set(node, record);
      }
      const next = translated(record.original, language);
      record.last = next;
      if (current !== next) node.nodeValue = next;
    };
    const translateElement = (element: Element) => {
      for (const attribute of ['placeholder', 'title', 'aria-label']) {
        const current = element.getAttribute(attribute);
        if (current === null) continue;
        let records = attributeOriginals.current.get(element);
        if (!records) { records = new Map(); attributeOriginals.current.set(element, records); }
        let record = records.get(attribute);
        if (!record || (current !== record.last && current !== record.original)) {
          record = { original: current, last: current };
          records.set(attribute, record);
        }
        const next = translated(record.original, language);
        record.last = next;
        if (current !== next) element.setAttribute(attribute, next);
      }
    };
    const scan = (element: Element) => {
      translateElement(element);
      for (const child of element.querySelectorAll('*')) translateElement(child);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) translateNode(walker.currentNode as Text);
    };
    scan(root);
    const observer = new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === 'characterData') translateNode(change.target as Text);
        else if (change.type === 'attributes') translateElement(change.target as Element);
        else for (const node of change.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) translateNode(node as Text);
          else if (node.nodeType === Node.ELEMENT_NODE) scan(node as Element);
        }
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
    return () => observer.disconnect();
  }, [language]);

  return <StaffLanguageContext.Provider value={{ language, setLanguage, saving, error, t: (value) => translated(value, language) }}><div ref={rootRef} lang={language}>{children}</div></StaffLanguageContext.Provider>;
}

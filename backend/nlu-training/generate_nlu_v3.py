#!/usr/bin/env python3
"""
NLU Training Data v3 Generator
===============================
Merges existing production data (nlu_final_v2) with:
1. New samples for critically underrepresented intents
2. New intents missing from the model (search_product, check_wallet, etc.)
3. DB-approved real user data
4. Human-curated v22 data
5. Cart operations v21 data
6. Reclassified samples (help -> chitchat for conversational queries)

Target: ~4500 balanced samples, 42 intents
"""

import json
import random
from collections import Counter
from pathlib import Path

random.seed(42)

# ============================================================
# NEW/AUGMENTED TRAINING SAMPLES
# ============================================================

NEW_SAMPLES = {
    # ================================================================
    # CRITICALLY LOW: chitchat (was 13, target 150+)
    # ================================================================
    "chitchat": [
        # English conversational
        "how are you",
        "how are you doing",
        "i am good",
        "i'm fine",
        "i am fine thank you",
        "what's up",
        "what is up",
        "nothing much",
        "just chilling",
        "im bored",
        "tell me something interesting",
        "tell me a joke",
        "who are you",
        "what are you",
        "what is your name",
        "what is mangwale",
        "what does mangwale do",
        "tell me about mangwale",
        "who made you",
        "who created you",
        "are you a robot",
        "are you AI",
        "are you human",
        "do you have feelings",
        "what can you do for me",
        "what all can you do",
        "what are your features",
        "what services do you offer",
        "how does this work",
        "how do i use this",
        "nice to meet you",
        "good to talk to you",
        "thats cool",
        "that's nice",
        "awesome",
        "great",
        "okay cool",
        "interesting",
        "wow",
        "lol",
        "haha",
        "funny",
        "you're funny",
        "you are smart",
        "good job",
        "well done",
        "nice work",
        "that's impressive",
        "what time is it",
        "what day is it",
        "how's the weather",
        "tell me the weather",
        "i love you",
        "you are the best",
        "best bot ever",
        "worst bot ever",
        "you suck",
        "this is bad",
        "you dont understand me",
        "this is not working",
        "what a waste",
        "can you sing",
        "can you dance",
        "do you sleep",
        "where are you from",
        "where do you live",
        "are you free",
        "i need a friend",
        "talk to me",
        "lets chat",
        "just talking",
        "random baat",
        # Hinglish conversational
        "kya haal hai",
        "kya chalu hai",
        "kaise ho",
        "kaise ho tum",
        "kaisa chal raha hai",
        "sab badhiya",
        "mast hai",
        "theek hai",
        "accha hai",
        "kya ho raha hai",
        "bore ho raha hun",
        "kuch batao",
        "kuch interesting batao",
        "mazak sunao",
        "joke sunao",
        "tum kaun ho",
        "tumhara naam kya hai",
        "mangwale kya hai",
        "mangwale kya karta hai",
        "mangwale ke baare mein batao",
        "tumhe kisne banaya",
        "kya tum robot ho",
        "kya tum AI ho",
        "kya tum insaan ho",
        "tum kya kya kar sakte ho",
        "tumhare features kya hai",
        "ye kaise kaam karta hai",
        "ye app kya hai",
        "milke accha laga",
        "badhiya",
        "mast",
        "wahh",
        "bahut accha",
        "sahi hai",
        "kya baat hai",
        "i am good yaar",
        "main theek hun",
        "main badhiya hun",
        "chal raha hai",
        "bas chal raha hai",
        "time pass",
        "kuch nahi chal raha",
        "bakwas mat karo",
        "samajh nahi aaya",
        "kya bol rahe ho",
        "aur batao",
        "aur kya",
        "phir",
        "fir bolo",
        "haan bolo",
        "accha accha",
        "hmm",
        "ok ok",
        "kuch khelade yarr aacha sa",
        "game khelne ka mann hai",
        "bore ho gaya",
        "kuch mazedaar batao",
        "aaj ka din kaisa hai",
        "mausam kaisa hai",
        "tum kahan se ho",
        "ghar kahan hai tumhara",
        "tum aadmi ho ya machine",
        "tumhari umar kya hai",
        "kya tum so jaate ho",
        "kya tum thaak jaate ho",
        "main akela hun",
        "baat karo mere saath",
        "bass baat karna hai",
        "timepass kar raha hun",
        # Hindi script  
        "कैसे हो",
        "क्या हाल है",
        "क्या चल रहा है",
        "बोर हो रहा हूँ",
        "कुछ बताओ",
        "तुम कौन हो",
        "मंगवाले क्या है",
        "तुम क्या कर सकते हो",
        "मज़ाक सुनाओ",
        "मैं ठीक हूँ",
        "अच्छा है",
    ],

    # ================================================================
    # CRITICALLY LOW: support_request (was 8, target 80)
    # ================================================================
    "support_request": [
        "i need help with my account",
        "i need support",
        "can i talk to someone",
        "connect me to support",
        "customer support please",
        "i want to speak to a human",
        "agent please",
        "human agent",
        "talk to real person",
        "i have a problem",
        "this is not working properly",
        "i am facing an issue",
        "something went wrong",
        "there is a bug",
        "app is not working",
        "payment failed help",
        "my order is wrong",
        "order mein problem hai",
        "delivery issue hai",
        "mujhe help chahiye",
        "kisi se baat karni hai",
        "support se connect karo",
        "customer care se baat karao",
        "agent se connect karo",
        "real person se baat karna hai",
        "problem ho rahi hai",
        "kuch galat ho gaya",
        "app kaam nahi kar raha",
        "payment fail ho gaya",
        "koi help karo",
        "issue hai mujhe",
        "complaint register karni hai",
        "grievance hai",
        "escalate karo",
        "manager se baat karna hai",
        "supervisor se connect karo",
        "urgent help chahiye",
        "emergency hai",
        "bahut problem ho rahi hai",
        "frustrated hun",
        "i am stuck",
        "main phasa hua hun",
        "kya karu ab",
        "samajh nahi aa raha",
        "guide me through this",
        "step by step batao",
        "how to fix this",
        "kaise theek karu",
        "not able to proceed",
        "aage nahi badh pa raha",
        "process stuck hai",
        "error aa raha hai",
        "technical issue",
        "login nahi ho raha",
        "account locked hai",
        "password bhool gaya",
        "otp nahi aa raha",
        "verification fail",
        "account se related problem",
        "billing issue",
        "wrong charge",
        "extra charge laga hai",
        "galat amount kata",
        "paisa wapas chahiye support",
        "सपोर्ट चाहिए",
        "मदद करो",
        "कोई हेल्प करो",
        "प्रॉब्लम हो रही है",
        "काम नहीं कर रहा",
    ],

    # ================================================================
    # CRITICALLY LOW: refund_request (was 8, target 80)
    # ================================================================
    "refund_request": [
        "i want a refund",
        "refund please",
        "give me my money back",
        "i want money back",
        "refund karo",
        "paisa wapas karo",
        "paisa wapas chahiye",
        "mere paise wapas do",
        "mera refund kahan hai",
        "where is my refund",
        "refund status",
        "refund process karo",
        "refund initiate karo",
        "cancel and refund",
        "order cancel karo aur refund do",
        "wrong item mila refund do",
        "quality kharab hai refund","galat order aya refund chahiye",
        "damaged item refund karo",
        "never received order refund",
        "order nahi mila paisa wapas do",
        "delivery nahi hua refund do",
        "late delivery refund",
        "partial refund chahiye",
        "full refund chahiye",
        "item missing refund",
        "extra charge refund karo",
        "double charge hua refund",
        "payment double ho gaya",
        "galat amount kata refund",
        "product kharab aaya",
        "wrong food mila",
        "food quality bad refund",
        "cold food mila refund",
        "stale food mila",
        "order incomplete tha refund",
        "half items missing refund",
        "overcharged hai refund karo",
        "mujhe refund dena padega",
        "refund nahi mila abhi tak",
        "refund pending hai",
        "kab milega refund",
        "how long for refund",
        "refund time kitna lagega",
        "wallet mein refund daal do",
        "bank mein refund chahiye",
        "upi pe refund karo",
        "refund aaya nahi",
        "2 din ho gaye refund nahi aaya",
        "पैसे वापस करो",
        "रिफंड चाहिए",
        "मेरा रिफंड कहाँ है",
        "पैसे वापस दो",
        "रिफंड कब मिलेगा",
        "i paid but order cancelled",
        "charged but no delivery",
        "money deducted no order",
        "paid twice for same order",
        "need my money back urgently",
        "how to get refund",
        "refund policy kya hai",
        "can i get refund after delivery",
        "return and refund",
        "exchange ya refund",
        "refund request karna hai",
        "file a refund claim",
        "dispute payment",
        "chargeback chahiye",
    ],

    # ================================================================
    # LOW: feedback (was 15, target 60)
    # ================================================================
    "feedback": [
        "i want to give feedback",
        "feedback dena hai",
        "i have some suggestions",
        "suggestion hai",
        "improvement suggestion",
        "app mein ye add karo",
        "this feature would be nice",
        "ye feature hona chahiye",
        "food was good",
        "food was bad",
        "delivery boy was good",
        "delivery boy was rude",
        "delivery was fast",
        "delivery was slow",
        "great experience",
        "bad experience",
        "restaurant service was good",
        "packaging was bad",
        "app is good",
        "app needs improvement",
        "i rate 5 stars",
        "i rate 1 star",
        "5 star rating",
        "rating dena hai",
        "review likhna hai",
        "review dena hai",
        "accha experience tha",
        "bura experience tha",
        "food tasty tha bhot",
        "food mein quality nahi thi",
        "delivery boy ne accha kaam kiya",
        "delivery late aayi feedback hai",
        "packaging theek nahi tha",
        "bahut maza aaya",
        "next time nahi order karunga",
        "definitely order karunga phir se",
        "recommend karunga doston ko",
        "excellent service",
        "poor service",
        "average experience",
        "could be better",
        "aur accha ho sakta tha",
        "bahut slow hai app",
        "app fast hai",
        "ui accha hai",
    ],

    # ================================================================
    # LOW: cancel (was 16, target 60)
    # ================================================================
    "cancel": [
        "cancel",
        "cancel karo",
        "ruk jao",
        "rehne do",
        "nahi chahiye",
        "mat karo",
        "band karo",
        "stop",
        "stop it",
        "abort",
        "quit",
        "exit",
        "leave it",
        "chhod do",
        "jane do",
        "bhool jao",
        "cancel everything",
        "sab cancel",
        "dont want anything",
        "kuch nahi chahiye",
        "i changed my mind",
        "mann badal gaya",
        "nahi karna hai",
        "i dont want this",
        "ye nahi chahiye",
        "never mind",
        "forget it",
        "chhodo",
        "bass",
        "enough",
        "no need",
        "zaroorat nahi",
        "hatao",
        "hata do",
        "nahi nahi",
        "no no no",
        "cancel this process",
        "ye process cancel karo",
        "go back",
        "wapas jao",
        "peeche jao",
        "back karo",
        "रुको",
        "कैंसल करो",
        "नहीं चाहिए",
        "मत करो",
    ],

    # ================================================================
    # LOW: restart (was 16, target 60) - already has some, add more
    # ================================================================
    "restart": [
        "restart",
        "start again",
        "begin from start",
        "fresh start",
        "naye se karo",
        "dobara shuru karo",
        "phir se try karo",
        "let me start again",
        "ek baar aur try",
        "try again",
        "once more",
        "do over",
        "redo",
        "fir se",
        "naya session",
        "new conversation",
        "nayi baat shuru karo",
        "reset everything",
        "sab reset karo",
        "clear and restart",
        "start from scratch",
        "shuru se",
        "beginning se",
        "from the top",
        "ek baar aur",
        "let me try differently",
        "different approach try karo",
        "wapas se order karna hai",
        "restart the process",
        "process restart karo",
        "refresh karo",
        "new start chahiye",
        "start from zero",
        "zero se shuru",
        "शुरू से शुरू करो",
        "फिर से करो",
        "दोबारा शुरू",
        "रीस्टार्ट करो",
        "नए से शुरू करो",
        "रीसेट करो",
    ],

    # ================================================================
    # LOW: repeat_order (was 23, target 80)
    # ================================================================
    "repeat_order": [
        "repeat my last order",
        "same order again",
        "repeat order",
        "reorder",
        "fir se wahi order",
        "wahi order chahiye",
        "same as last time",
        "pichla order repeat karo",
        "last order dobara",
        "last wala hi bhej do",
        "previous order repeat",
        "order again the same",
        "mere purane order se order karo",
        "wahi sab mangwao",
        "jo pehle mangwaya tha wahi",
        "same food again",
        "same items phir se",
        "duplicate last order",
        "copy last order",
        "wo jo kal mangwaya tha",
        "parso wala order repeat",
        "meera last order kya tha",
        "mera previous order dikhao",
        "past orders dikhao",
        "order history se repeat",
        "order history se fir se mangwao",
        "reorder from history",
        "favorite order repeat",
        "usual order bhej do",
        "regular order chahiye",
        "roz ka wala order",
        "hamesha ka order",
        "daily order repeat",
        "same misal tushar se",
        "fir se vada pav mangwao green bakes se",
        "wahi pizza do jo kal mangwaya tha",
        "same set meal repeat karo",
        "pichle hafte wala order",
        "पिछला ऑर्डर रिपीट करो",
        "वही ऑर्डर चाहिए",
        "फिर से वही भेजो",
        "same order dobara se",
        "phir se same mangwao",
        "jo abhi abhi order kiya wahi",
        "ek aur same order",
        "one more same order",
        "add same to cart again",
        "cart mein same items daalo",
        "pehle jaisa order bana do",
        "mera usual",
        "as usual",
        "the usual please",
    ],

    # ================================================================
    # LOW: complaint (was 31, target 80)
    # ================================================================
    "complaint": [
        "i have a complaint",
        "complaint hai",
        "shikayat hai",
        "i am not happy",
        "khush nahi hun",
        "very bad service",
        "bahut kharab service",
        "worst experience",
        "sabse bura experience",
        "food quality very bad",
        "khana kharab tha",
        "cold food aaya",
        "thanda khana aaya",
        "wrong order delivered",
        "galat order aaya",
        "missing items in order",
        "order mein items missing hai",
        "delivery boy was rude",
        "delivery boy badtameez tha",
        "too much delay",
        "bahut der laga di",
        "1 hour se wait kar raha hun",
        "order late hai bahut",
        "packaging damaged",
        "packaging tuta hua tha",
        "food spilled",
        "khana gir gaya tha",
        "hair in food",
        "khane mein baal tha",
        "unhygienic food",
        "ganda khana tha",
        "overcharging",
        "zyada charge kiya",
        "price different from menu",
        "menu se alag price lagaya",
        "quantity kam thi",
        "portion size chhota tha",
        "not fresh food",
        "baasi khana bheja",
        "expired item mila",
        "wrong restaurant ka food aaya",
        "kisi aur ka order de diya",
        "complaint register karo",
        "शिकायत करनी है",
        "खाना खराब था",
        "गलत ऑर्डर आया",
        "बहुत देर लगा दी",
    ],

    # ================================================================
    # LOW: remove_from_cart (was 37, target 80)
    # ================================================================
    "remove_from_cart": [
        "remove from cart",
        "cart se hatao",
        "cart se nikaalo",
        "remove pizza from cart",
        "delete item from cart",
        "cart se delete karo",
        "remove last item",
        "aakhiri item hatao",
        "remove this",
        "ye hatao",
        "nikal do ye",
        "dont want this item",
        "ye item nahi chahiye",
        "remove biryani",
        "biryani hatao cart se",
        "vada pav nikaalo",
        "samosa remove karo",
        "remove all items",
        "sab hatao cart se",
        "cart empty karo",
        "one item remove karo",
        "ek item kam karo",
        "remove extra items",
        "extra items hatao",
        "galti se add ho gaya remove karo",
        "by mistake add kiya tha",
        "ye nahi chahiye tha",
        "wrong item add ho gaya",
        "total kam karo ek item hatake",
        "remove the expensive one",
        "mehenga wala hatao",
        "remove duplicate",
        "duplicate item hatao",
        "2 se 1 karo",
        "ek kam karo",
        "cart se pizza remove kar do",
        "misal nahi chahiye hatao",
        "naan roti remove",
        "drink hatao cart se",
        "dessert nahi chahiye",
        "कार्ट से हटाओ",
        "ये नहीं चाहिए",
        "ये हटा दो",
    ],

    # ================================================================
    # LOW: ask_recommendation (was 41, target 80)
    # ================================================================
    "ask_recommendation": [
        "what should i order",
        "kya order karun",
        "suggest something",
        "kuch suggest karo",
        "best food kya hai",
        "best dish kya hai",
        "sabse accha kya hai yahan",
        "recommend something",
        "kuch recommend karo",
        "popular items kya hai",
        "trending kya hai",
        "logo kya order karte hai",
        "best seller kya hai",
        "top rated kya hai",
        "highest rated dish",
        "sabse zyada order kya hota hai",
        "famous kya hai",
        "yahan ka special kya hai",
        "today's special",
        "aaj ka special kya hai",
        "chef special",
        "must try kya hai",
        "kya try karun",
        "first time hun kya order karun",
        "naya hun suggest karo",
        "accha kya milega",
        "tasty kya hai",
        "mazedaar kya hai",
        "spicy kya hai",
        "sweet mein kya hai",
        "non veg mein kya best hai",
        "veg options suggest karo",
        "kids ke liye kya order karun",
        "family ke liye suggest karo",
        "party ke liye kya mangwau",
        "2 logon ke liye kya order karun",
        "budget friendly kya hai",
        "cheap mein accha kya milega",
        "क्या ऑर्डर करूं",
        "कुछ सुझाव दो",
    ],

    # ================================================================
    # NEW INTENT: search_product (not in model, target 100)
    # ================================================================
    "search_product": [
        "search",
        "search for pizza",
        "search vada pav",
        "search biryani",
        "search misal",
        "search paneer",
        "search momos",
        "find pizza near me",
        "find vada pav shops",
        "find biryani",
        "find misal pav",
        "find restaurants near me",
        "find food near me",
        "search restaurants",
        "search stores",
        "search shops near me",
        "search for tushar misal",
        "search rajabhau",
        "search green bakes",
        "search dominos",
        "search mcdonald",
        "search for burger",
        "search for ice cream",
        "search for chai",
        "search for coffee",
        "search samosa near me",
        "pizza dhoondo",
        "misal dhoondo",
        "vada pav dhoondo",
        "dhoondo biryani",
        "pizza search karo",
        "biryani search karo",
        "misal search karo",
        "koi accha restaurant dhoondo",
        "nearby restaurants dhoondo",
        "paas mein kya hai",
        "aas paas kya milega",
        "mere paas kya available hai",
        "food search karo",
        "items search karo",
        "products search karo",
        "show me pizza options",
        "show me misal options",
        "show me biryani shops",
        "vada pav kahan milega",
        "pizza kahan milega",
        "biryani kahan milega",
        "misal kahan milega",
        "samosa kahan milega",
        "momos kahan milega",
        "best biryani kahan milegi",
        "best pizza in nashik",
        "best misal in nashik",
        "best vada pav",
        "burger kahan milega",
        "ice cream shop search",
        "juice shop near me",
        "bakery search karo",
        "sweet shop dhoondo",
        "pav bhaji kahan milegi",
        "chinese food dhoondo",
        "south indian food near me",
        "north indian restaurant search",
        "nashik mein kya famous hai",
        "cidco mein kya milega",
        "satpur mein restaurant dhoondo",
        "college road pe kya hai",
        "search for chaat",
        "pani puri kahan milegi",
        "dosa kahan milega",
        "idli kahan milegi",
        "thali search karo",
        "lunch search",
        "dinner options dhoondo",
        "breakfast search",
        "snacks dhoondo",
        "search menu",
        "look for food",
        "explore restaurants",
        "explore food options",
        "what restaurants are available",
        "available stores dikhao",
        "show available shops",
        "खोजो",
        "ढूंढो",
        "पिज़्ज़ा ढूंढो",
        "मिसल ढूंढो",
        "रेस्टोरेंट ढूंढो",
        "पास में क्या है",
        "search karo bhai",
        "ek search karo",
        "search for me",
        "find me something to eat",
        "kuch dhundh ke do",
        "dikhao kya kya hai",
    ],

    # ================================================================
    # NEW INTENT: search_food (maps to food_order flow, target 80)
    # ================================================================
    "search_food": [
        "search food",
        "food search",
        "khana dhoondo",
        "khana search karo",
        "kuch khane ko dhoondo",
        "khane ka option dhoondo",
        "food options dikhao",
        "what food is available",
        "kya kya khana milega",
        "khana kya kya hai",
        "food menu search",
        "search food items",
        "food items dhoondo",
        "kuch khana hai search karo",
        "hunger hai food dhoondo",
        "bhook lagi hai kuch dhoondo",
        "search for meals",
        "lunch dhoondo",
        "dinner dhoondo",
        "breakfast dhoondo",
        "snacks dhoondo nearby",
        "tiffin search karo",
        "food delivery search",
        "food search near me",
        "nearby food options",
        "paas ka khana dikhao",
        "khana order karne ke liye search",
        "dabba search karo",
        "meals available kya hai",
        "what can i order to eat",
        "eating options search",
        "search healthy food",
        "healthy food dhoondo",
        "diet food search",
        "quick food search",
        "fast food search",
        "street food dhoondo",
        "home food search",
        "homemade food search",
        "ghar ka khana dhoondo",
        "tiffin service search",
        "mess ka khana search",
        "thali dhoondo",
        "veg food search",
        "non veg food search",
        "pure veg dhoondo",
        "egg dishes search",
        "seafood search",
        "mughlai food search",
        "south indian food search",
        "chinese food search",
        "italian food search",
        "continental food search",
        "nashik food search",
        "maharashtrian food dhoondo",
        "marathi khana search",
        "local food dhoondo",
        "traditional food search",
        "combo meal search",
        "value meal dhoondo",
        "खाना ढूंढो",
        "खाने का ऑप्शन दिखाओ",
        "फूड सर्च करो",
    ],

    # ================================================================
    # NEW INTENT: check_wallet (target 60)
    # ================================================================
    "check_wallet": [
        "check wallet",
        "wallet balance",
        "my wallet",
        "show wallet",
        "wallet dikhao",
        "mera wallet balance kya hai",
        "kitna balance hai wallet mein",
        "wallet balance check karo",
        "wallet mein kitna paisa hai",
        "wallet check karo",
        "how much balance in wallet",
        "show my balance",
        "mera balance dikhao",
        "paisa kitna hai",
        "wallet balance batao",
        "wallet open karo",
        "wallet details",
        "wallet history",
        "wallet transactions",
        "wallet ka history dikhao",
        "last wallet transaction",
        "wallet mein cashback aaya",
        "cashback check karo",
        "reward points kitne hai",
        "points balance",
        "meri earnings dikhao",
        "wallet se payment hoga",
        "wallet se pay karna hai",
        "wallet balance use karo",
        "wallet recharge karo",
        "wallet mein add karo",
        "add money to wallet",
        "wallet top up",
        "wallet fund karo",
        "wallet balance low hai",
        "insufficient wallet balance",
        "wallet mein paisa nahi hai",
        "wallet balance zero hai",
        "wallet se kitna kat jaega",
        "wallet mein credit hua kya",
        "refund wallet mein aaya kya",
        "वॉलेट बैलेंस",
        "वॉलेट दिखाओ",
        "मेरा बैलेंस बताओ",
        "वॉलेट चेक करो",
        "kitna paisa hai mere",
        "balance check",
        "mera paisa dikhao",
        "credit dikhao",
        "mangwale wallet",
        "wallet statement",
    ],

    # ================================================================
    # NEW INTENT: affirm (target 60)
    # ================================================================
    "affirm": [
        "yes",
        "haan",
        "ha",
        "haa",
        "ji",
        "ji haan",
        "bilkul",
        "zaroor",
        "of course",
        "sure",
        "definitely",
        "absolutely",
        "yeah",
        "yep",
        "yup",
        "correct",
        "sahi hai",
        "sahi",
        "theek hai",
        "ok",
        "okay",
        "done",
        "agreed",
        "proceed",
        "go ahead",
        "aage badho",
        "chalo",
        "kar do",
        "haan karo",
        "yes please",
        "please do",
        "yes i confirm",
        "confirmed",
        "i agree",
        "main agree karta hun",
        "ready",
        "ready hun",
        "main ready hun",
        "lets do it",
        "karte hai",
        "chalega",
        "haan chalega",
        "ye chalega",
        "perfect",
        "right",
        "exactly",
        "that's right",
        "wahi",
        "same",
        "yes that one",
        "haan wahi",
        "ho jayega",
        "kar lo",
        "haan bhai",
        "yes bro",
        "accha ok",
        "fine",
        "alright",
        "all good",
        "sab theek",
        "हाँ",
        "जी",
        "जी हाँ",
        "बिल्कुल",
        "ज़रूर",
        "ठीक है",
        "चलो",
        "कर दो",
    ],

    # ================================================================
    # NEW INTENT: browse_stores (target 60)
    # ================================================================
    "browse_stores": [
        "show me stores",
        "stores dikhao",
        "shops dikhao",
        "nearby stores",
        "nearby shops",
        "paas ke stores",
        "paas ki dukaan",
        "list of stores",
        "available stores",
        "available shops",
        "open stores",
        "khuli dukaan dikhao",
        "which stores are open",
        "kaun si dukaan khuli hai",
        "all restaurants",
        "sab restaurants dikhao",
        "restaurant list",
        "show all restaurants",
        "stores near me",
        "shops near me",
        "dukaan dhoondo",
        "browse shops",
        "browse stores",
        "browse restaurants",
        "restaurants in cidco",
        "stores in satpur",
        "nashik road pe kya hai",
        "college road stores",
        "panchavati area stores",
        "gangapur road restaurants",
        "indira nagar shops",
        "ambad shops",
        "vendor list dikhao",
        "all vendors",
        "registered stores",
        "partner restaurants",
        "which shops deliver",
        "delivery available kaun se stores",
        "food delivery stores",
        "online order stores",
        "show me all options",
        "sab options dikhao",
        "कौन सी दुकान खुली है",
        "दुकान दिखाओ",
        "रेस्टोरेंट लिस्ट",
        "पास के स्टोर्स",
        "store browse karo",
        "restaurants explore karo",
        "shops bata do",
    ],

    # ================================================================
    # NEW INTENT: browse_category (target 60)
    # ================================================================
    "browse_category": [
        "show categories",
        "categories dikhao",
        "food categories",
        "khana ki categories",
        "menu categories",
        "what categories available",
        "kya kya categories hain",
        "veg category",
        "non veg category",
        "snacks category",
        "drinks category",
        "desserts category",
        "main course category",
        "starters category",
        "breakfast category",
        "lunch category",
        "dinner category",
        "biryani category",
        "pizza category",
        "burger category",
        "chinese category",
        "south indian category",
        "north indian category",
        "maharashtrian category",
        "quick bites",
        "healthy food category",
        "combo meals",
        "value meals",
        "thali category",
        "street food category",
        "beverages",
        "juices category",
        "shakes category",
        "ice cream category",
        "cakes category",
        "sweets category",
        "mithai category",
        "grocery category",
        "pharmacy category",
        "essentials category",
        "all categories",
        "sab categories dikhao",
        "category wise dikhao",
        "filter by category",
        "category select karo",
        "show me types of food",
        "khane ke types",
        "food types dikhao",
        "cuisines dikhao",
        "cuisine list",
        "कैटेगरी दिखाओ",
        "खाने की कैटेगरी",
        "सब कैटेगरी दिखाओ",
    ],

    # ================================================================  
    # RECLASSIFIED: help (move these FROM help data TO more specific intents)
    # Keep help for explicit "how to use" type queries
    # ================================================================
    "help": [
        # Keep only explicit help/guide requests
        "how to use this app",
        "app kaise use kare",
        "guide me",
        "mujhe guide karo",
        "tutorial dikhao",
        "how to order",
        "order kaise kare",
        "how to pay",
        "payment kaise kare",
        "how to track order",
        "order track kaise kare",
        "how to cancel order",
        "order cancel kaise kare",
        "help with ordering",
        "ordering mein help",
        "help with payment",
        "payment mein help",
        "help with delivery",
        "delivery mein help",
        "step by step guide",
        "instructions de do",
        "how does ordering work",
        "how does delivery work",
        "how does payment work",
        "process batao",
        "kaise kaam karta hai ye",
        "user guide",
        "help menu",
        "help section",
        "how to create account",
        "account kaise banaye",
        "how to add address",
        "address kaise add kare",
        "how to apply coupon",
        "coupon kaise lagaye",
        "how to use wallet",
        "wallet kaise use kare",
        "kya kya features hai",
        "features batao",
        "options kya hai",
        "मदद चाहिए",
        "कैसे करें",
        "गाइड करो",
        "ऐप कैसे यूज़ करें",
        "ऑर्डर कैसे करें",
    ],
}

# ============================================================
# ADDITIONAL NER v4 TRAINING DATA
# ============================================================

NER_NEGATIVE_SAMPLES = [
    {"text": "how are you", "entities": []},
    {"text": "what can you do", "entities": []},
    {"text": "hello", "entities": []},
    {"text": "hi there", "entities": []},
    {"text": "thank you so much", "entities": []},
    {"text": "goodbye", "entities": []},
    {"text": "cancel karo", "entities": []},
    {"text": "help me please", "entities": []},
    {"text": "kaise ho", "entities": []},
    {"text": "main theek hun", "entities": []},
    {"text": "yes", "entities": []},
    {"text": "no", "entities": []},
    {"text": "haan karo", "entities": []},
    {"text": "nahi chahiye", "entities": []},
    {"text": "ok", "entities": []},
    {"text": "check wallet balance", "entities": []},
    {"text": "track my order", "entities": []},
    {"text": "show my cart", "entities": []},
    {"text": "repeat last order", "entities": []},
    {"text": "i want refund", "entities": []},
    {"text": "complaint hai", "entities": []},
    {"text": "support chahiye", "entities": []},
    {"text": "i am good", "entities": []},
    {"text": "what is mangwale", "entities": []},
    {"text": "bore ho raha hun", "entities": []},
    {"text": "tell me a joke", "entities": []},
    {"text": "nice to meet you", "entities": []},
    {"text": "kya haal hai", "entities": []},
    {"text": "feedback dena hai", "entities": []},
    {"text": "rating dena hai", "entities": []},
    {"text": "login karo", "entities": []},
    {"text": "logout karo", "entities": []},
    {"text": "account delete karo", "entities": []},
    {"text": "password change karo", "entities": []},
    {"text": "otp nahi aa raha", "entities": []},
    {"text": "payment failed", "entities": []},
    {"text": "app crash ho raha hai", "entities": []},
    {"text": "restart karo", "entities": []},
    {"text": "start over", "entities": []},
    {"text": "cancel everything", "entities": []},
    # Location text that should NOT be tagged as FOOD
    {"text": "Bhujbal chowk", "entities": [{"start": 0, "end": 14, "label": "LOC", "entity": "Bhujbal chowk"}]},
    {"text": "Farm Road area", "entities": [{"start": 0, "end": 14, "label": "LOC", "entity": "Farm Road area"}]},
    {"text": "Sunderban Colony", "entities": [{"start": 0, "end": 16, "label": "LOC", "entity": "Sunderban Colony"}]},
    {"text": "Chintamani Colony", "entities": [{"start": 0, "end": 17, "label": "LOC", "entity": "Chintamani Colony"}]},
    {"text": "Gangapur road", "entities": [{"start": 0, "end": 13, "label": "LOC", "entity": "Gangapur road"}]},
    {"text": "Panchavati area", "entities": [{"start": 0, "end": 15, "label": "LOC", "entity": "Panchavati area"}]},
    {"text": "College road nashik", "entities": [{"start": 0, "end": 19, "label": "LOC", "entity": "College road nashik"}]},
    {"text": "CIDCO nashik", "entities": [{"start": 0, "end": 12, "label": "LOC", "entity": "CIDCO nashik"}]},
    {"text": "Nashik road", "entities": [{"start": 0, "end": 11, "label": "LOC", "entity": "Nashik road"}]},
    {"text": "Dwarka circle", "entities": [{"start": 0, "end": 13, "label": "LOC", "entity": "Dwarka circle"}]},
]

# ============================================================
# MAIN: MERGE AND GENERATE
# ============================================================

def main():
    base_dir = Path(__file__).parent
    
    # 1. Load existing production data
    print("Loading production data (nlu_final_v2)...")
    existing = []
    existing_file = base_dir / "nlu_final_v2_production.jsonl"
    with open(existing_file) as f:
        for line in f:
            try:
                existing.append(json.loads(line.strip()))
            except:
                continue
    
    print(f"  Loaded {len(existing)} existing samples")
    
    # 2. Load human-curated v22
    v22_file = base_dir / "nlu_training_v22_human_realistic.jsonl"
    v22_data = []
    if v22_file.exists():
        with open(v22_file) as f:
            for line in f:
                try:
                    v22_data.append(json.loads(line.strip()))
                except:
                    continue
        print(f"  Loaded {len(v22_data)} v22 human-curated samples")
    
    # 3. Load cart operations v21
    v21_file = base_dir / "nlu_training_v21_cart_operations.jsonl"
    v21_data = []
    if v21_file.exists():
        with open(v21_file) as f:
            for line in f:
                try:
                    v21_data.append(json.loads(line.strip()))
                except:
                    continue
        print(f"  Loaded {len(v21_data)} v21 cart operation samples")
    
    # 4. Load DB approved data
    db_file = base_dir / "../../backend/models/training_data/approved_from_db.jsonl"
    db_data = []
    if db_file.exists():
        with open(db_file) as f:
            for line in f:
                try:
                    d = json.loads(line.strip())
                    if "text" in d and "intent" in d:
                        db_data.append(d)
                except:
                    continue
        print(f"  Loaded {len(db_data)} DB-approved samples")
    else:
        # Try alternate path
        db_file2 = base_dir / "../../backend/models/training_data/approved_clean.jsonl"
        if db_file2.exists():
            with open(db_file2) as f:
                for line in f:
                    try:
                        d = json.loads(line.strip())
                        if "text" in d and "intent" in d:
                            db_data.append(d)
                    except:
                        continue
            print(f"  Loaded {len(db_data)} DB-approved samples (from approved_clean)")
    
    # 5. Reclassify problematic samples from existing data
    print("\nReclassifying problematic samples...")
    reclassify_patterns = {
        # These "help" samples should be "chitchat"
        "what can you do": "chitchat",
        "what all can you do": "chitchat",
        "what can you help": "chitchat",
        "kya kya kar sakte ho": "chitchat",
        "tum kya kar sakte ho": "chitchat",
        "what are your capabilities": "chitchat",
        "what do you do": "chitchat",
        "tum kya karte ho": "chitchat",
    }
    
    reclassified = 0
    for item in existing:
        text_lower = item["text"].lower().strip()
        for pattern, new_intent in reclassify_patterns.items():
            if pattern in text_lower and item["intent"] == "help":
                item["intent"] = new_intent
                reclassified += 1
                break
    print(f"  Reclassified {reclassified} samples from help → chitchat")
    
    # 6. Build combined dataset
    print("\nBuilding combined dataset...")
    all_samples = []
    seen_texts = set()
    
    def add_samples(samples, source_name):
        added = 0
        for s in samples:
            text = s["text"].strip().lower()
            if text not in seen_texts and len(text) > 0:
                seen_texts.add(text)
                all_samples.append({"text": s["text"].strip(), "intent": s["intent"]})
                added += 1
        print(f"  Added {added} unique samples from {source_name}")
    
    # Add in priority order (first seen wins)
    add_samples(existing, "production v2")
    add_samples(v22_data, "v22 human-curated")
    add_samples(v21_data, "v21 cart-ops")
    add_samples(db_data, "DB approved")
    
    # 7. Add new generated samples
    print("\nAdding new generated samples...")
    for intent, texts in NEW_SAMPLES.items():
        added = 0
        for text in texts:
            text_lower = text.strip().lower()
            if text_lower not in seen_texts and len(text_lower) > 0:
                seen_texts.add(text_lower)
                all_samples.append({"text": text.strip(), "intent": intent})
                added += 1
        print(f"  {intent}: +{added} new samples")
    
    # 8. Remove or reduce overly-represented help samples
    # Keep max 45 help samples (down from 80)
    help_samples = [s for s in all_samples if s["intent"] == "help"]
    non_help = [s for s in all_samples if s["intent"] != "help"]
    if len(help_samples) > 45:
        random.shuffle(help_samples)
        help_samples = help_samples[:45]
        print(f"\n  Trimmed help to {len(help_samples)} samples")
    all_samples = non_help + help_samples
    
    # 9. Shuffle
    random.shuffle(all_samples)
    
    # 10. Statistics
    print(f"\n{'='*60}")
    print(f"FINAL DATASET: {len(all_samples)} samples")
    print(f"{'='*60}")
    
    dist = Counter(s["intent"] for s in all_samples)
    print(f"\nIntents: {len(dist)}")
    print(f"\nDistribution:")
    for intent, count in sorted(dist.items(), key=lambda x: -x[1]):
        bar = "█" * (count // 5)
        print(f"  {intent:25s}: {count:4d} {bar}")
    
    # Check balance
    max_count = max(dist.values())
    min_count = min(dist.values())
    print(f"\nBalance ratio: {max_count}:{min_count} = {max_count/min_count:.1f}:1")
    
    # 11. Save
    output_file = base_dir / "nlu_final_v3.jsonl"
    with open(output_file, 'w', encoding='utf-8') as f:
        for sample in all_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")
    print(f"\nSaved to: {output_file}")
    
    # 12. Also generate NER negative samples
    ner_output = base_dir / "ner_negative_samples_v4.jsonl"
    with open(ner_output, 'w', encoding='utf-8') as f:
        for sample in NER_NEGATIVE_SAMPLES:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")
    print(f"NER negatives saved to: {ner_output} ({len(NER_NEGATIVE_SAMPLES)} samples)")
    
    return output_file


if __name__ == "__main__":
    main()

import { useEffect, type ReactNode } from "react";

const EXACT: Record<string, string> = {
  "GAVHAH": "גבהה",
  "Gavhah": "גבהה",
  "Olam Hachesed Communications": "עולם החסד קאמוניקאציע",
  "Chesed News Center": "חסד נייעס צענטער",
  "Askanim Forum": "עסקנים פארום",
  "Activists Directory": "עסקנים דירעקטארי",
  "United In Kindness": "פאראייניגט אין חסד",
  "Today's Cause": "היינטיגער צוועק",
  "Today's Charity": "היינטיגע צדקה",
  "Today's Featured Cause": "היינטיגער אויסגעקליבענער צוועק",
  "Minyan Center": "מנינים צענטער",
  "Minyan Directory": "מנינים דירעקטארי",
  "Group Center": "גרופעס צענטער",
  "My Askanus": "מיין עסקנות",
  "Gavhah Office Reservations": "גבהה אפיס רעזערוואציעס",
  "Koach Harabim": "כח הרבים",
  "Koach Harabim Dashboard": "כח הרבים דעשבאורד",
  "Founder Dashboard": "גרינדער דעשבאורד",
  "Founder & Admin Dashboard": "גרינדער און אדמין דעשבאורד",
  "System Center": "סיסטעם צענטער",
  "Community Dashboard": "קהילה דעשבאורד",
  "Raising Kindness Worldwide.": "מרבים חסד איבער דער וועלט.",
  "Olam Chesed Yibaneh.": "עולם חסד יבנה.",
  "Join Kehilla": "שליס זיך אן צו דער קהילה",
  "Join the Kehilla": "שליס זיך אן צו דער קהילה",
  "Join This Cause": "שליס זיך אן צו דעם צוועק",
  "Sign In": "אריינלאגן",
  "Sign in": "אריינלאגן",
  "Sign Out": "ארויסלאגן",
  "Welcome Back": "ברוכים השבים",
  "Create Free Account": "עפן אן אומזיסטע אקאונט",
  "Membership is free": "מיטגלידערשאפט איז אומזיסט",
  "Search Gavhah": "זוך אין גבהה",
  "Search news, forum, groups, minyans, volunteers...": "זוך נייעס, פארום, גרופעס, מנינים, וואלונטירן...",
  "Search updates, organizations...": "זוך אפדעיטס, ארגאניזאציעס...",
  "Search discussions...": "זוך דיסקוסיעס...",
  "Search groups...": "זוך גרופעס...",
  "Search volunteers by name...": "זוך וואלונטירן לויט נאמען...",
  "Search by city...": "זוך לויט שטאט...",
  "No public results found": "קיין עפנטליכע רעזולטאטן נישט געפונען",
  "Type at least 2 characters.": "שרייב כאטש 2 אותיות.",
  "Try a different name, place, topic, or organization.": "פרוביר אן אנדער נאמען, ארט, טעמע אדער ארגאניזאציע.",
  "Phone / SMS Provider Not Connected": "טעלעפאן / עס־עם־עס פראוויידער נישט פארבונדן",
  "Provider not connected": "פראוויידער נישט פארבונדן",
  "Provider-Dependent Modules": "פראוויידער־אפהענגיגע אפטיילונגען",
  "Website Notifications Active": "וועבסייט מעלדונגען אקטיוו",
  "Website Notification": "וועבסייט מעלדונג",
  "Website Broadcast": "וועבסייט בראדקאסט",
  "Broadcast Messaging": "בראדקאסט מעסעדזשינג",
  "Send Broadcast Message": "שיק א בראדקאסט מעסעדזש",
  "Recent Broadcasts": "לעצטע בראדקאסטן",
  "All Members": "אלע מיטגלידער",
  "Volunteers Only": "נאר וואלונטירן",
  "Admins Only": "נאר אדמינס",
  "Only administrators can send platform-wide broadcasts.": "נאר אדמיניסטראטארן קענען שיקן בראדקאסטן איבער דער גאנצער פלאטפארמע.",
  "Phone Calls": "טעלעפאן קאלס",
  "Conference Calls": "קאנפערענץ קאלס",
  "Voicemail": "וואויסמעיל",
  "SMS": "עס־עם־עס",
  "Email — not connected": "אימעיל — נישט פארבונדן",
  "SMS — not connected": "עס־עם־עס — נישט פארבונדן",
  "Broadcast sent": "בראדקאסט געשיקט",
  "Could not send broadcast": "מען האט נישט געקענט שיקן דעם בראדקאסט",
  "Delivered": "דעליווערט",
  "Send a Message": "שיק א מעסעדזש",
  "Contact & Support": "קאנטאקט און הילף",
  "Support Inbox": "הילף אינבאקס",
  "Technical Support": "טעכנישע הילף",
  "General Inquiry": "אלגעמיינע פראגע",
  "Feedback": "פידבעק",
  "Urgent Chesed Matter?": "דרינגענדע חסד ענין?",
  "Frequently Asked Questions": "אפט געפרעגטע פראגעס",
  "FAQ": "אפט געפרעגטע פראגעס",
  "Community Guidelines": "קהילה אנווייזונגען",
  "Maintain respectful, Torah-appropriate language at all times": "האלט אייביג א מכובד׳יגע שפראך וואס פאסט פאר א תורה־קהילה",
  "Keep discussions focused and relevant to the community": "האלט די דיסקוסיעס צום ענין און שייך צום ציבור",
  "Do not share personal contact information publicly": "טייל נישט פערזענליכע קאנטאקט־אינפארמאציע עפנטליך",
  "Report inappropriate content using the report button": "באריכט אומפאסיגע אינהאלט מיטן באריכט־קנעפל",
  "Community Groups": "קהילה גרופעס",
  "Create Community Group": "שאף א קהילה גרופע",
  "Create a Community Project": "שאף א קהילה פראיעקט",
  "Community Projects & Initiatives": "קהילה פראיעקטן און איניציאטיוון",
  "Community Projects": "קהילה פראיעקטן",
  "Start a project, campaign, initiative, or assistance program for the community.": "הייב אן א פראיעקט, קאמפיין, איניציאטיוו אדער הילף־פראגראם פארן ציבור.",
  "Be the first activist to create a community project.": "זיי דער ערשטער עסקן צו שאפן א קהילה פראיעקט.",
  "No projects yet.": "נאך נישטא קיין פראיעקטן.",
  "No community projects yet.": "נאך נישטא קיין קהילה פראיעקטן.",
  "All community projects and their current status.": "אלע קהילה פראיעקטן מיט זייער יעצטיגן סטאטוס.",
  "Community Featured Cause": "אויסגעקליבענער קהילה־צוועק",
  "Know a Cause That Deserves This Spotlight?": "קענסטו א צוועק וואס פארדינט דעם אויפמערקזאמקייט?",
  "Submit a Future Cause": "שיק אריין א קומענדיגן צוועק",
  "Submissions are reviewed before appearing publicly.": "אריינגעשיקטע זאכן ווערן איבערגעקוקט איידער זיי ווערן עפנטלעך.",
  "No Active Cause Right Now": "יעצט איז נישטא קיין אקטיווער צוועק",
  "Register your commitment. Gavhah will coordinate with you directly.": "רעגיסטריר דיין התחייבות. גבהה וועט דירעקט קאארדינירן מיט דיר.",
  "Amount Pledged ($) *": "צוגעזאגטער סכום ($) *",
  "Amount Received ($) *": "באקומענער סכום ($) *",
  "Funds Pledged": "צוגעזאגטע געלטער",
  "Fundraising Goal ($)": "פאנדרעיזינג ציל ($)",
  "Fully funded!": "פולשטענדיג אויסגעפאנדעט!",
  "Still Needed": "נאך נויטיג",
  "Many donors this month": "פילע נדבנים דעם חודש",
  "Donate": "געב א נדבה",
  "Donor": "נדבן",
  "Donor / Organization": "נדבן / ארגאניזאציע",
  "Volunteer": "וואלונטיר",
  "Volunteer Time": "וואלונטיר־צייט",
  "Financial Support": "פינאנציעלע הילף",
  "Financial + Volunteer": "פינאנציעל + וואלונטיר",
  "Goods / Items": "זאכן / חפצים",
  "Register as a Volunteer": "רעגיסטריר זיך אלס וואלונטיר",
  "Featured Volunteers": "אויסגעקליבענע וואלונטירן",
  "Help Request": "הילף־בקשה",
  "Submit a Help Request": "שיק אריין א הילף־בקשה",
  "Edit Help Request": "רעדאקטיר די הילף־בקשה",
  "Urgent Needs": "דרינגענדע געברויכן",
  "Food Assistance": "עסן־הילף",
  "Housing": "וואוינונג",
  "Medical": "מעדיציניש",
  "Transportation": "טראנספארטאציע",
  "Coordination Help": "קאארדינאציע־הילף",
  "Training / Onboarding": "טרענירונג / אריינפיר",
  "Add a Minyan": "לייג צו א מנין",
  "No minyanim found for this search.": "קיין מנינים נישט געפונען פאר דעם זוך.",
  "Shacharis Times *": "שחרית צייטן *",
  "Mincha Times *": "מנחה צייטן *",
  "Maariv Times *": "מעריב צייטן *",
  "Shacharis:": "שחרית:",
  "Mincha:": "מנחה:",
  "Maariv:": "מעריב:",
  "Shabbos minyanim, special shiurim, etc.": "שבת מנינים, ספעציעלע שיעורים, אא״וו.",
  "Today's Overview": "היינטיגער איבערבליק",
  "Live Community Statistics": "לעבעדיגע קהילה סטאטיסטיק",
  "Live statistics across all departments.": "לעבעדיגע סטאטיסטיק איבער אלע אפטיילונגען.",
  "All-Time Summary": "אלגעמיינער סך־הכל",
  "Lifetime Impact": "אלגעמיינער איינפלוס",
  "Weekly Activity": "וועכנטליכע אקטיוויטעט",
  "Recent Activity": "לעצטע אקטיוויטעט",
  "Activity from the community will appear here.": "אקטיוויטעט פונעם ציבור וועט דא ערשיינען.",
  "Active modules across the platform.": "אקטיווע אפטיילונגען איבער דער פלאטפארמע.",
  "My Reservations": "מיינע רעזערוואציעס",
  "Office Reservations": "אפיס רעזערוואציעס",
  "Select a Date": "קלויב א דאטום",
  "Select a date to view available time slots.": "קלויב א דאטום צו זען וועלכע צייטן זענען פריי.",
  "Selected Appointment": "אויסגעקליבענער אפוינטמענט",
  "Confirm Reservation": "באשטעטיג די רעזערוואציע",
  "Purpose of Visit": "צוועק פונעם באזוך",
  "By Appointment": "מיט אפוינטמענט",
  "Has bookings": "האט בוקינגס",
  "No reservations yet.": "נאך נישטא קיין רעזערוואציעס.",
  "My Notes": "מיינע נאטיצן",
  "Task Manager": "אויפגאבע פארוואלטער",
  "Case Files": "קעיס פיילס",
  "Case Review": "קעיס איבערבליק",
  "Open New Case": "עפן א נייעם קעיס",
  "New Case": "נייער קעיס",
  "Open Case": "אפענער קעיס",
  "Update Case Progress": "אפדעיט קעיס פארשריט",
  "Activity History": "אקטיוויטעט היסטאריע",
  "Review your case activity log across all cases.": "קוק איבער די אקטיוויטעט־לאג פון אלע קעיסעס.",
  "No activity recorded yet.": "נאך נישטא קיין רעקארדירטע אקטיוויטעט.",
  "No follow-up notes yet.": "נאך נישטא קיין נאכפאלג־נאטיצן.",
  "No notes yet.": "נאך נישטא קיין נאטיצן.",
  "No notifications yet.": "נאך נישטא קיין מעלדונגען.",
  "No notifications yet": "נאך נישטא קיין מעלדונגען",
  "No discussions found.": "קיין דיסקוסיעס נישט געפונען.",
  "No trending topics yet.": "נאך נישטא קיין טרענדינג טעמעס.",
  "No groups found.": "קיין גרופעס נישט געפונען.",
  "No members yet — be the first to join!": "נאך נישטא קיין מיטגלידער — זיי דער ערשטער זיך אנצושליסן!",
  "No members yet.": "נאך נישטא קיין מיטגלידער.",
  "No announcements yet.": "נאך נישטא קיין מעלדונגען.",
  "No reports to review.": "נישטא קיין באריכטן איבערצוקוקן.",
  "No support messages yet.": "נאך נישטא קיין הילף־מעסעדזשעס.",
  "No help requests yet.": "נאך נישטא קיין הילף־בקשות.",
  "No minyan submissions yet.": "נאך נישטא קיין מנין־אריינשיקונגען.",
  "No cause submissions yet.": "נאך נישטא קיין צוועק־אריינשיקונגען.",
  "No cause activity yet.": "נאך נישטא קיין צוועק־אקטיוויטעט.",
  "No saved items yet": "נאך נישטא קיין אפגעהיטענע זאכן",
  "No follows yet": "נאך נישטא קיין נאכפאלגונגען",
  "Start a Discussion": "הייב אן א דיסקוסיע",
  "Start the first discussion": "הייב אן די ערשטע דיסקוסיע",
  "Leave a Reply": "לאז א תגובה",
  "Share your thoughts or advice...": "טייל דיינע געדאנקען אדער עצות...",
  "Share with the group": "טייל מיט דער גרופע",
  "Write a post...": "שרייב א פאוסט...",
  "Back to Forum": "צוריק צום פארום",
  "Back to Groups": "צוריק צו גרופעס",
  "Back to News": "צוריק צו נייעס",
  "Article not found.": "דער ארטיקל איז נישט געפונען געווארן.",
  "Discussion not found.": "די דיסקוסיע איז נישט געפונען געווארן.",
  "Group not found.": "די גרופע איז נישט געפונען געווארן.",
  "More Stories": "נאך באריכטן",
  "Latest Updates": "לעצטע אפדעיטס",
  "Important Updates": "וויכטיגע אפדעיטס",
  "Breaking Alerts": "ברעיקינג אלערטן",
  "Breaking / Urgent": "ברעיקינג / דרינגענד",
  "Post Community Update": "פובליקיר א קהילה אפדעיט",
  "Content Moderation": "אינהאלט מאדעראציע",
  "Content Reports": "אינהאלט באריכטן",
  "Content Report": "אינהאלט באריכט",
  "User Management": "באניצער פארוואלטונג",
  "Member Management": "מיטגלידער פארוואלטונג",
  "Platform Overview": "פלאטפארמע איבערבליק",
  "Platform Statistics": "פלאטפארמע סטאטיסטיק",
  "Platform Status": "פלאטפארמע סטאטוס",
  "Feature Management": "פיטשער פארוואלטונג",
  "Minyan Submissions": "מנין אריינשיקונגען",
  "Cause Submissions": "צוועק אריינשיקונגען",
  "Cause Activity": "צוועק אקטיוויטעט",
  "Announcements": "מעלדונגען",
  "Create Announcement": "שאף א מעלדונג",
  "Announcement title": "מעלדונג טיטל",
  "Announcement content...": "מעלדונג אינהאלט...",
  "This area is for founders and administrators only.": "דער טייל איז נאר פאר גרינדער און אדמיניסטראטארן.",
  "This section is for administrators only.": "די אפטיילונג איז נאר פאר אדמיניסטראטארן.",
  "Admin Access Required": "אדמין צוטריט פארלאנגט",
  "Access Restricted": "צוטריט באגרעניצט",
  "Verifying access...": "מען באשטעטיגט צוטריט...",
  "Private contact details are visible here only to administrators.": "פריוואטע קאנטאקט־דעטאלן זענען דא זעבאר נאר פאר אדמיניסטראטארן.",
  "Live appointments booked through the public reservation page.": "לעבעדיגע אפוינטמענטס געבוקט דורכן עפנטליכן רעזערוואציע־בלאַט.",
  "Messages submitted through System Center.": "מעסעדזשעס געשיקט דורכן סיסטעם צענטער.",
  "Follow volunteers, groups, projects, and more.": "פאלג נאך וואלונטירן, גרופעס, פראיעקטן און נאך.",
  "Save forum posts, news articles, causes, and more for later.": "היט אפ פארום־פאוסטס, נייעס־ארטיקלען, צוועקן און נאך פאר שפעטער.",
  "Change Password": "טויש פעסווארד",
  "Current Password": "יעצטיגער פעסווארד",
  "New Password": "נייער פעסווארד",
  "Confirm New Password": "באשטעטיג נייעם פעסווארד",
  "Confirm Password": "באשטעטיג פעסווארד",
  "Repeat your password": "שרייב נאכאמאל דיין פעסווארד",
  "Minimum 8 characters": "מינדסטנס 8 אותיות",
  "At least 8 characters": "כאטש 8 אותיות",
  "Email or Phone Number": "אימעיל אדער טעלעפאן נומער",
  "Sign in to your kehilla account": "לאג אריין אין דיין קהילה אקאונט",
  "My Profile": "מיין פראפיל",
  "Edit Profile": "רעדאקטיר פראפיל",
  "About Me": "וועגן מיר",
  "A short bio...": "א קורצע באשרייבונג...",
  "Nickname / Display Name": "צונאמען / ווייז־נאמען",
  "How the community will know you": "ווי דער ציבור וועט דיך קענען",
  "All names shown are nicknames to protect privacy.": "אלע געוויזענע נעמען זענען צונעמען כדי צו באשיצן פריוואטקייט.",
  "Activists Directory shows nicknames only to protect privacy.": "די עסקנים דירעקטארי ווייזט נאר צונעמען כדי צו באשיצן פריוואטקייט.",
  "Contact via Gavhah": "קאנטאקט דורך גבהה",
  "Privacy": "פריוואטקייט",
  "Terms": "תנאים",
  "Support": "הילף",
  "Home": "היים",
  "More": "מער",
  "Search": "זוכן",
  "Notifications": "מעלדונגען",
  "Departments": "אפטיילונגען",
  "Community": "קהילה",
  "Services": "סערוויסעס",
  "Platform": "פלאטפארמע",
  "Account": "אקאונט",
  "Loading...": "לאדנט...",
  "Cancel": "אפזאגן",
  "Save": "אפהיטן",
  "Delete discussion": "מעק אויס די דיסקוסיע",
  "Edit Discussion": "רעדאקטיר דיסקוסיע",
  "Edit Group": "רעדאקטיר גרופע",
  "Delete project": "מעק אויס דעם פראיעקט",
  "Edit Project": "רעדאקטיר פראיעקט",
  "Add Task": "לייג צו אויפגאבע",
  "Reopen": "עפן נאכאמאל",
  "Undo": "מאך צוריק",
  "Ban": "פארשפאר",
  "Suspend": "סוספענדיר",
  "Selected": "אויסגעקליבן",
  "Featured": "אויסגעקליבן",
  "Completed": "פארטיג",
  "Public": "עפנטלעך",
  "Private": "פריוואט",
  "Normal": "נארמאל",
  "Important": "וויכטיג",
  "Urgent": "דרינגענד",
  "Critical": "קריטיש",
  "High": "הויך",
  "Medium": "מיטל",
  "Low": "נידריג",
  "Anytime": "סיי ווען",
  "Weekdays": "וואכנטעג",
  "Weekends": "וויקענד",
  "Evenings": "אוונטן",
  "On Call": "אויף רוף",
  "Campaign": "קאמפיין",
  "Initiative": "איניציאטיוו",
  "Program": "פראגראם",
  "Project": "פראיעקט",
  "Person": "פערזאן",
  "Organization": "ארגאניזאציע",
  "Other": "אנדערע",
  "About": "וועגן",
  "History": "היסטאריע",
  "Summary": "סך־הכל",
  "Goal": "ציל",
  "Category": "קאטעגאריע",
  "Type": "סארט",
  "Title": "טיטל",
  "Title *": "טיטל *",
  "Description": "באשרייבונג",
  "Description *": "באשרייבונג *",
  "Name": "נאמען",
  "Name / Reference *": "נאמען / רעפערענץ *",
  "Your Name": "דיין נאמען",
  "Your Name *": "דיין נאמען *",
  "Full Name": "פולער נאמען",
  "Full name": "פולער נאמען",
  "Your full name": "דיין פולער נאמען",
  "Your nickname": "דיין צונאמען",
  "Location": "ארט",
  "City *": "שטאט *",
  "Country": "לאנד",
  "Address": "אדרעס",
  "Subject": "נושא",
  "Message": "מעסעדזש",
  "Content": "אינהאלט",
  "Priority": "פריאריטעט",
  "Deadline": "טערמין",
  "Role": "ראלע",
  "Availability": "צייט־מעגליכקייט",
  "Skills": "פעאיגקייטן",
  "Notes": "נאטיצן",
  "Note": "נאטיץ",
  "Task *": "אויפגאבע *",
  "Related Case": "שייכותדיקער קעיס",
  "Due Date": "טערמין־דאטום",
  "Contact Name": "קאנטאקט נאמען",
  "Contact Information": "קאנטאקט אינפארמאציע",
  "Organization / Department": "ארגאניזאציע / אפטיילונג",
  "Recipient Group": "מקבל־גרופע",
  "Channel": "קאנאל",
  "Group Name": "גרופע נאמען",
  "Group Name *": "גרופע נאמען *",
  "Synagogue Name *": "בית המדרש נאמען *",
  "City / Community *": "שטאט / קהילה *",
  "Need Type": "סארט געברויך",
  "Type of Need": "סארט געברויך",
  "Areas of Help *": "געביטן פון הילף *",
  "Goal / What You Need": "ציל / וואס מען דארף",
  "Brief Description": "קורצע באשרייבונג",
  "Full Details *": "פולע דעטאלן *",
  "Organizer Name *": "ארגאניזירער נאמען *",
  "Cause Title *": "צוועק טיטל *",
  "All Departments": "אלע אפטיילונגען",
  "Users": "באניצער",
  "Members": "מיטגלידער",
  "Projects": "פראיעקטן",
  "Causes": "צוועקן",
  "Charity": "צדקה",
  "Moderation": "מאדעראציע",
  "Suggestion": "פארשלאג",
  "Members Only": "נאר פאר מיטגלידער",
  "Join Free": "שליס זיך אן אומזיסט",
  "join free": "שליס זיך אן אומזיסט",
  "participate": "אנטיילנעמען",
  "Anonymous": "אנאנים",
  "Nickname": "צונאמען",
  "Display As": "ווייז נאמען אלס",
  "Your community nickname": "דיין קהילה־צונאמען",
  "No name shown": "קיין נאמען ווערט נישט געוויזן",
  "Image": "בילד",
  "Replace": "טויש אויס",
  "Remove": "נעם אראפ",
  "Uploading image...": "בילד ווערט ארויפגעלאדן...",
  "Choose image from phone": "קלויב א בילד פונעם טעלעפאן",
  "Or paste an image URL": "אדער לייג אריין א בילד־לינק",
  "Images are compressed automatically. Maximum stored size: 1.5 MB.": "בילדער ווערן אויטאמאטיש צאמגעדריקט. מאקסימום אפגעהיטענע גרויס: 1.5 MB.",
  "Could not upload image": "מען האט נישט געקענט ארויפלאדן דעם בילד",
  "Could not read image": "מען האט נישט געקענט לייענען דעם בילד",
  "Could not open image": "מען האט נישט געקענט עפענען דעם בילד",
  "Please choose an image file": "ביטע קלויב א בילד־פייל",
  "Image processing is not supported on this device": "בילד־פארארבעטונג ווערט נישט געשטיצט אויף דעם דעווייס",
  "Could not compress image": "מען האט נישט געקענט צאמדריקן דעם בילד",
  "Image is still too large after compression": "דער בילד איז נאך אלץ צו גרויס נאך צאמדרוקן",
  "Image upload failed": "בילד־ארויפלאד איז דורכגעפאלן",
  "Sign in to follow": "לאג אריין צו נאכפאלגן",
  "Join Gavhah free to follow community activity.": "שליס זיך אן אומזיסט צו גבהה כדי נאכצופאלגן קהילה־אקטיוויטעט.",
  "Unfollowed": "נישט מער נאכגעפאלגט",
  "Following": "נאכפאלגנדיג",
  "Follow": "פאלג נאך",
  "Sign in to save": "לאג אריין צו אפהיטן",
  "Join Gavhah free to save articles and resources.": "שליס זיך אן אומזיסט צו גבהה כדי אפצוהיטן ארטיקלען און רעסורסן.",
  "Removed from saved": "אראפגענומען פון אפגעהיטענע",
  "Saved": "אפגעהיטן",
  "Remove from saved": "נעם אראפ פון אפגעהיטענע",
  "Report": "באריכט",
  "Submit a Report": "שיק אריין א באריכט",
  "Reason": "סיבה",
  "Spam or irrelevant": "ספאם אדער נישט שייך",
  "Inappropriate content": "אומפאסיגע אינהאלט",
  "Misinformation": "פאלשע אינפארמאציע",
  "Harassment or abuse": "באדערונג אדער מיסברויך",
  "Additional details (optional)": "נאך דעטאלן (אויב געוואונטשן)",
  "Describe the issue...": "באשרייב דעם פראבלעם...",
  "Submitting...": "שיקט אריין...",
  "Submit Report": "שיק אריין באריכט",
  "Sign in to report content": "לאג אריין כדי צו באריכטן אינהאלט",
  "Join Gavhah free to help moderate the community.": "שליס זיך אן אומזיסט צו גבהה כדי צו העלפן האלטן סדר אין דער קהילה.",
  "Report submitted": "באריכט אריינגעשיקט",
  "Our moderation team will review this.": "אונזער מאדעראציע־מאנשאפט וועט דאס איבערקוקן.",
  "Your Message": "דיין מעסעדזש",
  "Brief subject": "קורצער נושא",
  "Describe your issue or feedback...": "באשרייב דיין פראבלעם אדער פידבעק...",
  "Your request will be reviewed by Gavhah staff. All information is handled with full discretion.": "דיין בקשה וועט ווערן איבערגעקוקט דורך גבהה שטאב. אלע אינפארמאציע ווערט באהאנדלט מיט פולער דיסקרעציע.",
  "All relevant information, context, and action items...": "אלע שייכותדיקע אינפארמאציע, קאנטעקסט און וואס דארף געטון ווערן...",
  "Any details we should know...": "סיי וועלכע דעטאלן וואס מיר דארפן וויסן...",
  "Optional notes...": "אויב געוואונטשן, נאטיצן...",
  "Any starting notes...": "סיי וועלכע אנהייב־נאטיצן...",
  "What happened? What was done?": "וואס איז געשען? וואס איז געטון געווארן?",
  "What needs to be done?": "וואס דארף געטון ווערן?",
  "What needs to be followed up on?": "אויף וואס דארף מען נאכפאלגן?",
  "Write your note here...": "שרייב דיין נאטיץ דא...",
  "Note title...": "נאטיץ טיטל...",
  "Brief case title": "קורצער קעיס־טיטל",
  "Case details...": "קעיס דעטאלן...",
  "What is this group for?": "פאר וואס איז די גרופע?",
  "What is this project about? Who does it help? What is the plan?": "וועגן וואס איז דער פראיעקט? וועמען העלפט עס? וואס איז דער פלאן?",
  "Clear, descriptive project name": "קלארער באשרייבנדיקער פראיעקט־נאמען",
  "Clear, descriptive headline": "קלארע באשרייבנדיקע קעפל",
  "One sentence — what is this update about?": "איין זאץ — וועגן וואס איז דער אפדעיט?",
  "Your broadcast message...": "דיין בראדקאסט מעסעדזש...",
  "Message subject...": "מעסעדזש נושא..."
};

const WORDS: Record<string, string> = {
  "news":"נייעס","forum":"פארום","directory":"דירעקטארי","group":"גרופע","groups":"גרופעס",
  "member":"מיטגליד","members":"מיטגלידער","volunteer":"וואלונטיר","volunteers":"וואלונטירן",
  "community":"קהילה","project":"פראיעקט","projects":"פראיעקטן","cause":"צוועק","causes":"צוועקן",
  "charity":"צדקה","donation":"נדבה","donations":"נדבות","donor":"נדבן","minyan":"מנין","minyans":"מנינים",
  "reservation":"רעזערוואציע","reservations":"רעזערוואציעס","notification":"מעלדונג","notifications":"מעלדונגען",
  "announcement":"מעלדונג","announcements":"מעלדונגען","message":"מעסעדזש","messages":"מעסעדזשעס",
  "broadcast":"בראדקאסט","broadcasts":"בראדקאסטן","phone":"טעלעפאן","call":"קאל","calls":"קאלס",
  "email":"אימעיל","account":"אקאונט","profile":"פראפיל","admin":"אדמין","administrator":"אדמיניסטראטאר",
  "administrators":"אדמיניסטראטארן","founder":"גרינדער","dashboard":"דעשבאורד","system":"סיסטעם",
  "center":"צענטער","search":"זוכן","home":"היים","more":"מער","join":"אנשליסן","create":"שאפן",
  "add":"צולייגן","edit":"רעדאקטירן","delete":"אויסמעקן","save":"אפהיטן","submit":"אריינשיקן",
  "confirm":"באשטעטיגן","cancel":"אפזאגן","update":"אפדעיט","view":"זען","open":"עפן","close":"פארמאכן",
  "back":"צוריק","all":"אלע","only":"בלויז","new":"נייע","current":"יעצטיג","recent":"לעצטע",
  "latest":"לעצטע","today":"היינט","name":"נאמען","title":"טיטל","description":"באשרייבונג","details":"דעטאלן",
  "location":"ארט","city":"שטאט","country":"לאנד","address":"אדרעס","category":"קאטעגאריע","type":"סארט",
  "status":"סטאטוס","role":"ראלע","privacy":"פריוואטקייט","public":"עפנטלעך","private":"פריוואט",
  "date":"דאטום","time":"צייט","deadline":"טערמין","priority":"פריאריטעט","activity":"אקטיוויטעט",
  "history":"היסטאריע","summary":"סך־הכל","goal":"ציל","amount":"סכום","funds":"געלטער","support":"הילף",
  "help":"הילף","request":"בקשה","requests":"בקשות","urgent":"דרינגענד","urgency":"דרינגענדקייט",
  "important":"וויכטיג","critical":"קריטיש","high":"הויך","medium":"מיטל","low":"נידריג",
  "featured":"אויסגעקליבן","active":"אקטיוו","completed":"פארטיג","available":"פאראן",
  "availability":"צייט־מעגליכקייט","select":"אויסקלויבן","selected":"אויסגעקליבן","loading":"לאדנט",
  "no":"קיין","not":"נישט","found":"געפונען","yet":"נאך","notes":"נאטיצן","note":"נאטיץ",
  "task":"אויפגאבע","tasks":"אויפגאבעס","case":"קעיס","cases":"קעיסעס","content":"אינהאלט",
  "subject":"נושא","password":"פעסווארד","language":"שפראך","services":"סערוויסעס","platform":"פלאטפארמע",
  "department":"אפטיילונג","departments":"אפטיילונגען","campaign":"קאמפיין","initiative":"איניציאטיוו",
  "program":"פראגראם","organization":"ארגאניזאציע","financial":"פינאנציעל","training":"טרענירונג",
  "transportation":"טראנספארטאציע","medical":"מעדיציניש","housing":"וואוינונג","food":"עסן",
  "monday":"מאנטאג","tuesday":"דינסטאג","wednesday":"מיטוואך","thursday":"דאנערשטאג",
  "friday":"פרייטאג","saturday":"שבת","sunday":"זונטאג","january":"יאנואר","february":"פעברואר",
  "march":"מערץ","april":"אפריל","may":"מאי","june":"יוני","july":"יולי","august":"אויגוסט",
  "september":"סעפטעמבער","october":"אקטאבער","november":"נאוועמבער","december":"דעצעמבער",
  "am":"פארמיטאג","pm":"נאכמיטאג"
};

const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

function escapeRegExp(value: string) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function translateText(raw: string): string {
  if (!/[A-Za-z]/.test(raw)) return raw;
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.match(/\s*$/)?.[0] ?? "";
  const core = raw.trim();
  if (!core) return raw;
  if (/^https?:\/\//i.test(core) || /^mailto:/i.test(core) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(core)) return raw;

  let out = EXACT[core] ?? core;

  if (out === core) {
    const dynamicRules: Array<[RegExp, string | ((...args: string[]) => string)]> = [
      [/^Join the Gavhah community to .+\. Membership is free and open to all\.$/, "שליס זיך אן צו דער גבהה קהילה כדי אנטיילצונעמען. מיטגלידערשאפט איז אומזיסט און אפן פאר אלעמען."],
      [/^You are no longer following (.+)\.$/, (_m, title) => `דו פאלגסט מער נישט נאך ${title}.`],
      [/^You are now following (.+)\.$/, (_m, title) => `דו פאלגסט יעצט נאך ${title}.`],
      [/^(.+) added to your saved items\.$/, (_m, title) => `${title} איז צוגעלייגט צו דיינע אפגעהיטענע זאכן.`],
      [/^Delivered to ([0-9,]+) website notification inboxes\.$/, (_m, count) => `דעליווערט צו ${count} וועבסייט מעלדונג־אינבאקסן.`],
    ];

    for (const [pattern, replacement] of dynamicRules) {
      if (pattern.test(core)) {
        out = typeof replacement === "string" ? core.replace(pattern, replacement) : core.replace(pattern, replacement as any);
        break;
      }
    }
  }

  if (out === core && core.length <= 48) {
    const alphaWords = core.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
    const allKnown = alphaWords.length > 0 && alphaWords.every(word => Object.prototype.hasOwnProperty.call(WORDS, word));
    if (allKnown) {
      const keys = Object.keys(WORDS).sort((a, b) => b.length - a.length);
      for (const key of keys) {
        const rx = new RegExp("\\b" + escapeRegExp(key) + "\\b", "gi");
        out = out.replace(rx, WORDS[key]);
      }
    }
  }

  return leading + out + trailing;
}

function shouldSkip(el: Element | null) {
  if (!el) return true;
  const tag = el.tagName.toLowerCase();
  return tag === "script" || tag === "style" || tag === "code" || tag === "pre" || el.hasAttribute("data-no-yiddish");
}

function translateElement(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current.nodeType === Node.TEXT_NODE) textNodes.push(current as Text);
  }
  for (const node of textNodes) {
    const parent = node.parentElement;
    if (shouldSkip(parent)) continue;
    const next = translateText(node.nodeValue ?? "");
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  const elements: Element[] = [];
  if (root instanceof Element) elements.push(root);
  if ("querySelectorAll" in root) elements.push(...Array.from(root.querySelectorAll("*")));
  for (const el of elements) {
    if (shouldSkip(el)) continue;
    for (const attr of ATTRS) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const next = translateText(value);
      if (next !== value) el.setAttribute(attr, next);
    }
  }
}

export function YiddishMirror({ active, children }: { active: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!active) return;
    document.documentElement.lang = "yi";
    document.documentElement.dir = "rtl";
    document.body.setAttribute("data-yiddish-mirror", "true");
    document.title = "גבהה — עולם החסד";

    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute("content", "גבהה — עולם החסד, א קהילה פלאטפארמע פאר חסד, עסקנות, גרופעס, מנינים, צדקה און הילף.");
    }

    translateElement(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target.parentElement) {
          const node = mutation.target as Text;
          if (shouldSkip(node.parentElement)) continue;
          const next = translateText(node.nodeValue ?? "");
          if (next !== node.nodeValue) node.nodeValue = next;
          continue;
        }
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node as Text;
            if (shouldSkip(text.parentElement)) continue;
            const next = translateText(text.nodeValue ?? "");
            if (next !== text.nodeValue) text.nodeValue = next;
          } else if (node instanceof Element) {
            translateElement(node);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.body.removeAttribute("data-yiddish-mirror");
    };
  }, [active]);

  return <>{children}</>;
}

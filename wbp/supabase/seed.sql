-- World Business Plus — seed data (generated from catalog)
-- Safe to re-run: uses upsert (on conflict).

insert into brands (id,name,short,color,description,sort) values
  ('dahua','Dahua Technology','Dahua','#E3000F','{"fr":"Leader mondial de la vidéosurveillance et des solutions de sécurité intelligentes. WBP opère en tant que Dahua Algérie.","en":"Global leader in video surveillance and smart security solutions. WBP operates as Dahua Algeria.","ar":"شركة رائدة عالمياً في المراقبة بالفيديو وحلول الأمن الذكية. تعمل WBP كوكيل Dahua الجزائر."}'::jsonb,0),
  ('ajax','Ajax Systems','Ajax','#1B1B1B','{"fr":"Systèmes d''alarme sans fil primés, design et fiabilité au service de la protection.","en":"Award-winning wireless alarm systems — design and reliability for total protection.","ar":"أنظمة إنذار لاسلكية حائزة على جوائز — تصميم وموثوقية لحماية كاملة."}'::jsonb,1),
  ('maxhub','MAXHUB','MAXHUB','#222222','{"fr":"Écrans interactifs et solutions d''affichage et de conférence pour l''entreprise moderne.","en":"Interactive displays and conferencing solutions for the modern enterprise.","ar":"شاشات تفاعلية وحلول العرض والمؤتمرات للمؤسسات الحديثة."}'::jsonb,2),
  ('ubiquiti','Ubiquiti','Ubiquiti','#0559C9','{"fr":"Réseaux WiFi professionnels UniFi : performance, portée et gestion centralisée.","en":"UniFi professional WiFi networks: performance, range and centralized management.","ar":"شبكات WiFi احترافية UniFi: أداء ومدى وإدارة مركزية."}'::jsonb,3),
  ('imou','IMOU','IMOU','#FF6A00','{"fr":"Caméras connectées grand public, simples à installer et à piloter via smartphone.","en":"Smart consumer cameras, easy to install and control from your smartphone.","ar":"كاميرات ذكية للمستهلك، سهلة التركيب والتحكم عبر الهاتف."}'::jsonb,4),
  ('wd','Western Digital','WD','#0B5FA5','{"fr":"Stockage haute fiabilité, conçu pour la vidéosurveillance 24/7.","en":"High-reliability storage, engineered for 24/7 surveillance.","ar":"تخزين عالي الموثوقية، مصمم للمراقبة على مدار الساعة."}'::jsonb,5),
  ('seagate','Seagate','Seagate','#6EBE49','{"fr":"Disques durs SkyHawk et Exos pour la surveillance et le datacenter.","en":"SkyHawk and Exos drives for surveillance and the datacenter.","ar":"أقراص SkyHawk وExos للمراقبة ومراكز البيانات."}'::jsonb,6),
  ('apollo','Apollo / APC','Apollo','#C8102E','{"fr":"Détection incendie adressable et conventionnelle, conforme aux normes.","en":"Addressable and conventional fire detection, standards-compliant.","ar":"كشف الحريق العنواني والتقليدي، متوافق مع المعايير."}'::jsonb,7)
on conflict (id) do update set name=excluded.name, short=excluded.short, color=excluded.color, description=excluded.description, sort=excluded.sort;

insert into categories (id,icon,name,blurb,sort) values
  ('cameras','camera','{"fr":"Vidéosurveillance","en":"Video Surveillance","ar":"المراقبة بالفيديو"}'::jsonb,'{"fr":"Caméras IP, NVR, XVR et accessoires","en":"IP cameras, NVR, XVR & accessories","ar":"كاميرات IP وأجهزة تسجيل وملحقات"}'::jsonb,0),
  ('alarm','shield','{"fr":"Alarme & Intrusion","en":"Alarm & Intrusion","ar":"الإنذار ومكافحة التسلل"}'::jsonb,'{"fr":"Kits Ajax & Dahua sans fil","en":"Ajax & Dahua wireless kits","ar":"أطقم Ajax وDahua اللاسلكية"}'::jsonb,1),
  ('access','fingerprint','{"fr":"Contrôle d''accès","en":"Access Control","ar":"التحكم في الوصول"}'::jsonb,'{"fr":"Lecteurs, claviers & badges","en":"Readers, keypads & badges","ar":"قارئات ولوحات مفاتيح وبطاقات"}'::jsonb,2),
  ('intercom','door','{"fr":"Interphonie vidéo","en":"Video Intercom","ar":"الاتصال الداخلي بالفيديو"}'::jsonb,'{"fr":"Platines de rue & moniteurs","en":"Door stations & monitors","ar":"محطات الأبواب والشاشات"}'::jsonb,3),
  ('displays','monitor','{"fr":"Affichage & Conférence","en":"Displays & Conferencing","ar":"العرض والمؤتمرات"}'::jsonb,'{"fr":"Écrans interactifs MAXHUB","en":"MAXHUB interactive screens","ar":"شاشات MAXHUB التفاعلية"}'::jsonb,4),
  ('fire','flame','{"fr":"Alarme incendie","en":"Fire Alarm","ar":"إنذار الحريق"}'::jsonb,'{"fr":"Centrales & détecteurs","en":"Panels & detectors","ar":"لوحات تحكم وكواشف"}'::jsonb,5),
  ('network','wifi','{"fr":"Réseau & WiFi","en":"Network & WiFi","ar":"الشبكات والواي فاي"}'::jsonb,'{"fr":"Points d''accès & switches UniFi","en":"UniFi access points & switches","ar":"نقاط وصول ومحولات UniFi"}'::jsonb,6),
  ('storage','drive','{"fr":"Stockage","en":"Storage","ar":"التخزين"}'::jsonb,'{"fr":"Disques durs surveillance","en":"Surveillance hard drives","ar":"أقراص صلبة للمراقبة"}'::jsonb,7)
on conflict (id) do update set icon=excluded.icon, name=excluded.name, blurb=excluded.blurb, sort=excluded.sort;

insert into products (id,cat,brand,name,code,badge,rating,reviews_count,tag,specs,sort) values
  ('p01','cameras','dahua','Caméra Dahua Dome IP 5MP Fix 2.8mm WizMind','DH-IPC-HDBW5541R-ASE','bestseller',4.8,42,'{"fr":"Dôme IP anti-vandale","en":"Vandal-proof IP dome","ar":"قبة IP مضادة للتخريب"}'::jsonb,'[["Résolution","5 MP (2592×1944)"],["Capteur","1/2.7\" CMOS"],["Objectif","2.8 mm fixe"],["IR","Smart IR 50 m"],["Protection","IP67 / IK10"],["IA","WizMind — détection humaine & véhicule"]]'::jsonb,0),
  ('p02','cameras','dahua','Kit Caméra Dahua Box IP 12MP WizMind','DH-IPC-HF71242F-Z-X','new',4.9,17,'{"fr":"Box 4K Ultra HD","en":"4K Ultra HD box","ar":"صندوق 4K فائق الدقة"}'::jsonb,'[["Résolution","12 MP / 4K"],["Capteur","1/1.7\" CMOS"],["Objectif","Motorisé varifocal"],["Compression","H.265+ / Smart Codec"],["IA","WizMind Pro"]]'::jsonb,1),
  ('p03','cameras','dahua','Caméra Dahua IP Access ANPR (Lecture de plaques)','DHI-ITC413-PW4D',null,4.7,9,'{"fr":"Reconnaissance de plaques","en":"License-plate recognition","ar":"التعرف على اللوحات"}'::jsonb,'[["Résolution","4 MP"],["Fonction","ANPR / LPR"],["Objectif","8–32 mm motorisé"],["Déclenchement","Boucle / radar"],["Sorties","Barrière & relais"]]'::jsonb,2),
  ('p04','cameras','imou','Caméra IMOU Bullet 2 4MP WiFi','IPC-F46FP',null,4.4,23,'{"fr":"WiFi extérieure","en":"Outdoor WiFi","ar":"واي فاي خارجي"}'::jsonb,'[["Résolution","4 MP"],["Connectivité","WiFi 2.4 GHz"],["Vision","Couleur nocturne"],["Audio","Micro intégré"],["Protection","IP67"]]'::jsonb,3),
  ('p05','cameras','dahua','Armoire d''Alimentation 12V / 30A – 18 Sorties','PWR-1230-18','bestseller',4.6,31,'{"fr":"Alimentation centralisée","en":"Centralized power","ar":"تغذية مركزية"}'::jsonb,'[["Tension","12 V DC"],["Courant","30 A"],["Sorties","18 protégées par fusible"],["Boîtier","Métallique verrouillable"]]'::jsonb,4),
  ('p06','cameras','dahua','Armoire d''Alimentation 12V / 5A – 9 Sorties','PWR-1205-09',null,4.5,12,'{"fr":"Compacte 9 sorties","en":"Compact 9-output","ar":"مدمج 9 مخارج"}'::jsonb,'[["Tension","12 V DC"],["Courant","5 A"],["Sorties","9 protégées"],["Boîtier","Métallique"]]'::jsonb,5),
  ('p07','alarm','ajax','Kit Ajax StarterKit + StreetSiren extérieure','AJAX-SK-SS','bestseller',4.9,58,'{"fr":"Pack démarrage sans fil","en":"Wireless starter pack","ar":"حزمة بداية لاسلكية"}'::jsonb,'[["Hub","Hub 2 (4G optionnel)"],["Détecteurs","MotionProtect + DoorProtect"],["Sirène","StreetSiren extérieure"],["Portée radio","Jusqu''à 2 000 m (Jeweller)"],["Autonomie","Jusqu''à 7 ans (piles)"]]'::jsonb,6),
  ('p08','alarm','dahua','Dahua AirShield Alarm HUB 2','DH-ART-ARC3800H-03-FW2',null,4.6,14,'{"fr":"Centrale hybride","en":"Hybrid panel","ar":"لوحة هجينة"}'::jsonb,'[["Zones","Jusqu''à 150 sans fil"],["Communication","WiFi / Ethernet / 4G"],["Protocole","AirShield"],["App","DMSS"]]'::jsonb,7),
  ('p09','alarm','ajax','Ajax MotionProtect — Détecteur de mouvement','AJAX-MP','new',4.8,21,'{"fr":"Anti-animaux","en":"Pet-immune","ar":"مناعة الحيوانات"}'::jsonb,'[["Détection","PIR 12 m"],["Angle","88.5°"],["Immunité","Animaux < 20 kg"],["Autonomie","Jusqu''à 5 ans"]]'::jsonb,8),
  ('p10','access','dahua','Émetteur de Cartes Dahua','DHI-ASM100',null,4.5,8,'{"fr":"Enrôlement USB","en":"USB enrollment","ar":"تسجيل USB"}'::jsonb,'[["Interface","USB 2.0"],["Fréquence","13.56 MHz / 125 kHz"],["Usage","Émission de badges"]]'::jsonb,9),
  ('p11','access','dahua','Lecteur de Contrôle d''Accès Dahua (Carte RFID)','ASR1200E','bestseller',4.7,19,'{"fr":"Lecteur RFID","en":"RFID reader","ar":"قارئ RFID"}'::jsonb,'[["Fréquence","13.56 MHz Mifare"],["Protocole","Wiegand / RS-485"],["Protection","IP65"],["Distance","Jusqu''à 3 cm"]]'::jsonb,10),
  ('p12','access','dahua','Lecteur d''Accès Dahua Anti-Vandale (Carte & Code)','ASR1101M-V1',null,4.6,11,'{"fr":"Anti-vandale IK10","en":"IK10 vandal-proof","ar":"مضاد للتخريب IK10"}'::jsonb,'[["Saisie","Clavier + carte"],["Protection","IP65 / IK10"],["Protocole","Wiegand / OSDP"],["Rétroéclairage","Clavier lumineux"]]'::jsonb,11),
  ('p13','access','dahua','Lecteur d''Accès Dahua Autonome WiFi (Clavier & Carte)','ASI2212J-PW',null,4.4,7,'{"fr":"Autonome WiFi","en":"Standalone WiFi","ar":"مستقل واي فاي"}'::jsonb,'[["Capacité","3 000 utilisateurs"],["Connectivité","WiFi + TCP/IP"],["Saisie","Carte + mot de passe"],["App","DMSS / ConfigTool"]]'::jsonb,12),
  ('p14','intercom','dahua','Platine de Rue Dahua IP Villa','DHI-VTO2202F-P','bestseller',4.7,26,'{"fr":"Poste extérieur 2 fils","en":"2-wire door station","ar":"محطة باب خارجية"}'::jsonb,'[["Caméra","2 MP grand angle"],["Communication","SIP / 2 fils"],["Protection","IP65 / IK07"],["Déverrouillage","Relais intégré"]]'::jsonb,13),
  ('p15','intercom','dahua','Moniteur Intérieur Dahua VTH Tactile 7"','DHI-VTH2421FW-P',null,4.6,13,'{"fr":"Écran tactile 7\"","en":"7\" touch monitor","ar":"شاشة لمس 7 إنش"}'::jsonb,'[["Écran","7\" IPS tactile"],["Connexion","PoE / 2 fils"],["Fonctions","Surveillance + alarme"],["Mémoire","microSD"]]'::jsonb,14),
  ('p16','intercom','dahua','Alimentation & Switch IP Dahua pour Moniteurs VTH','DHI-VTNS1060A-A','bestseller',4.5,16,'{"fr":"Switch PoE intercom","en":"PoE intercom switch","ar":"محول PoE للاتصال"}'::jsonb,'[["Ports","6 × PoE"],["Usage","Alimentation moniteurs VTH"],["Norme","IEEE 802.3af/at"]]'::jsonb,15),
  ('p17','displays','maxhub','Écran Tactile Interactif 75" MAXHUB V6 Classic','C7530','bestseller',4.9,34,'{"fr":"4K tactile 75 pouces","en":"75\" 4K touch","ar":"شاشة لمس 75 إنش 4K"}'::jsonb,'[["Diagonale","75\" 4K UHD"],["Tactile","20 points"],["OS","Android 11 + OPS PC"],["Connectique","HDMI / USB-C / WiFi"],["Stylet","Écriture double"]]'::jsonb,16),
  ('p18','displays','maxhub','Smart Podium MAXHUB','SL22MC','new',4.7,8,'{"fr":"Pupitre intelligent","en":"Smart lectern","ar":"منصة ذكية"}'::jsonb,'[["Écran","21.5\" tactile"],["Usage","Présentation & annotation"],["Connectique","HDMI / USB"],["Contrôle","Pilotage salle"]]'::jsonb,17),
  ('p19','displays','maxhub','Caméra PTZ Dual-eye Tracking 4K MAXHUB','P30',null,4.8,12,'{"fr":"Visio 4K auto-tracking","en":"4K auto-tracking","ar":"تتبع تلقائي 4K"}'::jsonb,'[["Résolution","4K UHD"],["Zoom","12× optique"],["Cadrage","Auto-tracking double capteur"],["Connexion","USB / HDMI"]]'::jsonb,18),
  ('p20','displays','maxhub','Écran LED All-in-One Raptor MAXHUB','LM135A01',null,4.6,6,'{"fr":"Mur LED 135\"","en":"135\" LED wall","ar":"جدار LED 135 إنش"}'::jsonb,'[["Diagonale","135\" Full HD"],["Type","LED COB"],["Installation","All-in-One"],["Usage","Salle de conseil"]]'::jsonb,19),
  ('p21','fire','apollo','Centrale Incendie Adressable Apollo','APO-ADR-2L',null,4.5,5,'{"fr":"Adressable 2 boucles","en":"2-loop addressable","ar":"عنواني حلقتان"}'::jsonb,'[["Boucles","2 (extensible)"],["Points","Jusqu''à 254 / boucle"],["Conformité","EN 54"],["Interface","Écran LCD"]]'::jsonb,20),
  ('p22','fire','apollo','Détecteur de Fumée Conventionnel Apollo','APO-CONV-SMK',null,4.4,4,'{"fr":"Optique conventionnel","en":"Conventional optical","ar":"بصري تقليدي"}'::jsonb,'[["Type","Optique de fumée"],["Tension","9–30 V"],["Conformité","EN 54-7"],["Indicateur","LED 360°"]]'::jsonb,21),
  ('p23','network','ubiquiti','Ubiquiti UniFi U6 Pro — Point d''accès WiFi 6','U6-Pro','bestseller',4.8,29,'{"fr":"WiFi 6 plafonnier","en":"WiFi 6 ceiling AP","ar":"نقطة وصول WiFi 6"}'::jsonb,'[["Norme","WiFi 6 (802.11ax)"],["Débit","Jusqu''à 5.3 Gbps"],["Clients","300+ simultanés"],["Alimentation","PoE+"]]'::jsonb,22),
  ('p24','network','ubiquiti','Ubiquiti UniFi Switch 24 PoE (250W)','USW-24-PoE',null,4.7,15,'{"fr":"Switch managé 24 ports","en":"24-port managed switch","ar":"محول مُدار 24 منفذ"}'::jsonb,'[["Ports","24 × Gigabit"],["PoE","16 × PoE 250 W"],["Uplink","2 × SFP"],["Gestion","UniFi Network"]]'::jsonb,23),
  ('p25','storage','seagate','Disque Dur 10TB Seagate SkyHawk','ST10000VE000','bestseller',4.7,38,'{"fr":"Surveillance 24/7","en":"24/7 surveillance","ar":"مراقبة على مدار الساعة"}'::jsonb,'[["Capacité","10 TB"],["Usage","Vidéosurveillance 24/7"],["Cache","256 MB"],["Flux","Jusqu''à 64 caméras HD"],["Garantie","3 ans"]]'::jsonb,24),
  ('p26','storage','seagate','Disque Dur 16TB Seagate Exos','ST16000NM000J',null,4.6,18,'{"fr":"Datacenter entreprise","en":"Enterprise datacenter","ar":"مركز بيانات للمؤسسات"}'::jsonb,'[["Capacité","16 TB"],["Interface","SATA 6 Gb/s"],["Vitesse","7200 tr/min"],["MTBF","2.5 M heures"]]'::jsonb,25),
  ('p27','storage','wd','Disque Dur WD Purple 8TB Surveillance','WD84PURZ','new',4.7,22,'{"fr":"AllFrame 4K","en":"AllFrame 4K","ar":"AllFrame 4K"}'::jsonb,'[["Capacité","8 TB"],["Technologie","AllFrame 4K"],["Cache","256 MB"],["Charge","180 TB/an"]]'::jsonb,26)
on conflict (id) do update set cat=excluded.cat, brand=excluded.brand, name=excluded.name, code=excluded.code, badge=excluded.badge, rating=excluded.rating, reviews_count=excluded.reviews_count, tag=excluded.tag, specs=excluded.specs, sort=excluded.sort;

insert into clients (name,sort) values
  ('Sonatrach',0),
  ('Sonelgaz',1),
  ('SNTF',2),
  ('SNVI',3),
  ('ETUSA',4),
  ('BNA',5),
  ('ENAP',6),
  ('CDER',7),
  ('Université de Bouzaréah',8),
  ('Hyatt Regency',9),
  ('Pharmalliance',10),
  ('Biogalenic',11),
  ('Merinal',12),
  ('Ifri',13),
  ('Guedila',14),
  ('Jotun',15),
  ('Grupo Puma',16),
  ('Aurora',17)
on conflict do nothing;

-- ---------- Site settings (defaults) ----------
-- NOTE : depuis fix-all.sql, la clé primaire de `settings` est (site, key) et
-- non plus (key) seule. Un « on conflict (key) » échouerait désormais avec
-- « no unique or exclusion constraint matching the ON CONFLICT specification ».
insert into settings (site, key, value) values
  ('wbp', 'whatsapp', '"213559533698"'::jsonb),
  ('wbp', 'contact', '{"email":"commercial@wbp-dz.com","phones":["0559 533 698","0560 061 082"],"fax":"Tél/Fax : 023 70 80 21","address":{"fr":"Cité DNC G8, Bt D, N°07, Garidi 1, Kouba, 16006 Alger, Algérie","en":"Cité DNC G8, Bt D, N°07, Garidi 1, Kouba, 16006 Algiers, Algeria","ar":"حي DNC G8، عمارة D، رقم 07، قاريدي 1، القبة، 16006 الجزائر العاصمة"}}'::jsonb),
  ('wbp', 'hero', '{"fr":{"title":"","sub":""},"en":{"title":"","sub":""},"ar":{"title":"","sub":""}}'::jsonb)
on conflict (site, key) do nothing;

-- catch-all category for the full catalog import
insert into categories (id,icon,name,blurb,sort) values
  ('autres','box','{"fr":"Divers & accessoires","en":"Other & accessories","ar":"متفرقات وملحقات"}'::jsonb,'{"fr":"Câbles, supports, alimentation & divers","en":"Cables, mounts, power & more","ar":"كابلات ودعامات وتغذية والمزيد"}'::jsonb,99)
on conflict (id) do nothing;

-- Migration: 20260524000003_golf_grove_reimport.sql
-- 1. Fix unique constraint: global unit_no → per-project (unit_no, project_id)
-- 2. Wipe and reimport all Golf Grove units + unit_sales from authoritative PDF data
-- 241 Waterside data is NOT touched.

-- ── 1. Fix unique constraint ─────────────────────────────────────────────────
ALTER TABLE public.units DROP CONSTRAINT IF EXISTS units_unit_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS units_unit_no_project_id_key
  ON public.units(unit_no, project_id);

-- ── 2. Delete existing Golf Grove unit_sales ──────────────────────────────────
DELETE FROM public.unit_sales
WHERE unit_id IN (
  SELECT id FROM public.units
  WHERE project_id = '00000000-0000-0000-0000-000000000001'
);

-- ── 3. Delete existing Golf Grove units ───────────────────────────────────────
DELETE FROM public.units
WHERE project_id = '00000000-0000-0000-0000-000000000001';

-- ── 4. Insert Golf Grove units ────────────────────────────────────────────────
-- unit_type derived from area: <500=1 Bedroom, 500-800=2 Bedroom, 800-1100=3 Bedroom, >=1100=Penthouse
-- Unsold units listed separately (no area in source, type per PDF)
INSERT INTO public.units (unit_no, floor, unit_type, area_sqft, listed_price, project_id, sale_status, blocked)
VALUES
-- Floor 1 sold
('101', 1, '1 Bedroom', 406.21,  586000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('102', 1, '1 Bedroom', 405.42,  586000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('103', 1, '1 Bedroom', 407.70,  588000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('104', 1, '3 Bedroom', 948.30, 1040000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('105', 1, '1 Bedroom', 414.62,  589000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('106', 1, '1 Bedroom', 417.27,  591000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('107', 1, '1 Bedroom', 419.77,  593000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('109', 1, '1 Bedroom', 407.37,  607000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('110', 1, '1 Bedroom', 413.01,  614000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('111', 1, 'Penthouse', 1004.49,1152000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('112', 1, 'Penthouse', 1093.60,1220000, '00000000-0000-0000-0000-000000000001', 'sold', false),
-- Floor 1 unsold
('108', 1, '1 Bedroom',    0,   1119000, '00000000-0000-0000-0000-000000000001', 'available', false),
('113', 1, '1 Bedroom',    0,   1297000, '00000000-0000-0000-0000-000000000001', 'available', false),
('114', 1, '1 Bedroom',    0,   1328000, '00000000-0000-0000-0000-000000000001', 'available', false),
-- Floor 2 sold
('201', 2, '1 Bedroom', 403.75,  584000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('202', 2, '1 Bedroom', 405.32,  586000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('203', 2, '1 Bedroom', 407.64,  588000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('204', 2, '2 Bedroom', 764.68,  902000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('205', 2, '1 Bedroom', 415.19,  675000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('206', 2, '1 Bedroom', 417.31,  620000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('207', 2, '1 Bedroom', 419.67,  625000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('208', 2, '3 Bedroom', 878.10, 1030000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('209', 2, '1 Bedroom', 399.80,  661500, '00000000-0000-0000-0000-000000000001', 'sold', false),
('210', 2, '1 Bedroom', 404.53,  608000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('211', 2, '2 Bedroom', 746.19,  978000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('212', 2, '2 Bedroom', 670.93,  906000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('214', 2, 'Penthouse', 1042.69,1239000, '00000000-0000-0000-0000-000000000001', 'sold', false),
-- Floor 2 unsold
('213', 2, '1 Bedroom',    0,    968000, '00000000-0000-0000-0000-000000000001', 'available', false),
-- Floor 3 sold
('301', 3, '1 Bedroom', 397.45,  614000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('302', 3, '1 Bedroom', 405.45,  590000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('303', 3, '1 Bedroom', 407.82,  675000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('304', 3, '2 Bedroom', 764.77,  910000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('305', 3, '1 Bedroom', 414.60,  592000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('306', 3, '1 Bedroom', 417.28,  595000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('307', 3, '1 Bedroom', 419.68,  597000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('308', 3, '3 Bedroom', 878.37, 1039000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('309', 3, '1 Bedroom', 399.24,  683000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('310', 3, '1 Bedroom', 404.68,  692000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('311', 3, '2 Bedroom', 746.06,  985000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('312', 3, '2 Bedroom', 671.13,  913000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('313', 3, '2 Bedroom', 725.08,  986000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('314', 3, '2 Bedroom', 743.57, 1011000, '00000000-0000-0000-0000-000000000001', 'sold', false),
-- Floor 4 sold
('401', 4, '1 Bedroom', 403.75,  619000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('402', 4, '1 Bedroom', 405.32,  593000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('403', 4, '1 Bedroom', 407.64,  596000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('404', 4, '2 Bedroom', 764.68,  910000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('405', 4, '1 Bedroom', 415.19,  596000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('406', 4, '1 Bedroom', 417.31,  599000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('407', 4, '1 Bedroom', 419.67,  610000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('409', 4, '1 Bedroom', 399.80,  684000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('410', 4, '1 Bedroom', 404.53,  692000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('411', 4, '2 Bedroom', 746.19,  992000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('412', 4, '2 Bedroom', 670.93,  919000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('413', 4, '2 Bedroom', 725.23,  994000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('414', 4, 'Penthouse', 1042.69,1258000, '00000000-0000-0000-0000-000000000001', 'sold', false),
-- Floor 4 unsold
('408', 4, '1 Bedroom',    0,   1047000, '00000000-0000-0000-0000-000000000001', 'available', false),
-- Floor 5 sold
('501', 5, '1 Bedroom', 397.45,  618000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('502', 5, '1 Bedroom', 405.45,  593000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('503', 5, '1 Bedroom', 407.82,  597000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('504', 5, '2 Bedroom', 764.77,  910000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('505', 5, '1 Bedroom', 414.60,  596000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('506', 5, '1 Bedroom', 417.28,  599000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('507', 5, '1 Bedroom', 419.68,  601000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('509', 5, '1 Bedroom', 399.24,  687000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('510', 5, '1 Bedroom', 404.68,  696000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('511', 5, '2 Bedroom', 746.06,  992000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('512', 5, '2 Bedroom', 671.13,  919000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('513', 5, '2 Bedroom', 725.08,  993000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('514', 5, '2 Bedroom', 743.57, 1019000, '00000000-0000-0000-0000-000000000001', 'sold', false),
-- Floor 5 unsold
('508', 5, '1 Bedroom',    0,   1047000, '00000000-0000-0000-0000-000000000001', 'available', false),
-- Floor 6 sold
('601', 6, '1 Bedroom', 403.75,  623000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('602', 6, '1 Bedroom', 405.32,  598000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('603', 6, '1 Bedroom', 407.64,  601000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('604', 6, '2 Bedroom', 764.68,  998000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('605', 6, '1 Bedroom', 415.19,  601000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('606', 6, '1 Bedroom', 417.31,  603000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('607', 6, '1 Bedroom', 419.67,  604000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('608', 6, '3 Bedroom', 878.10, 1047000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('609', 6, '1 Bedroom', 399.80,  689000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('610', 6, '1 Bedroom', 404.53,  695000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('611', 6, '2 Bedroom', 746.19,  999000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('612', 6, '2 Bedroom', 670.93,  926000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('613', 6, '2 Bedroom', 725.23, 1001000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('614', 6, 'Penthouse', 1042.69,1266000, '00000000-0000-0000-0000-000000000001', 'sold', false),
-- Floor 7 sold
('701', 7, '1 Bedroom', 397.45,  622000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('702', 7, '1 Bedroom', 405.44,  598000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('703', 7, '1 Bedroom', 407.69,  601000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('705', 7, '1 Bedroom', 414.62,  600000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('706', 7, '1 Bedroom', 417.31,  602000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('707', 7, '1 Bedroom', 419.66,  660000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('708', 7, '3 Bedroom', 878.37, 1056000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('709', 7, '1 Bedroom', 399.22,  692000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('710', 7, '1 Bedroom', 404.69,  700000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('711', 7, '2 Bedroom', 745.69,  999000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('712', 7, '2 Bedroom', 671.12,  926000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('713', 7, '2 Bedroom', 725.09, 1001000, '00000000-0000-0000-0000-000000000001', 'sold', false),
('714', 7, '2 Bedroom', 743.58, 1026000, '00000000-0000-0000-0000-000000000001', 'sold', false),
-- Floor 7 unsold
('704', 7, '1 Bedroom',    0,    999000, '00000000-0000-0000-0000-000000000001', 'available', false);

-- ── 5. Insert Golf Grove unit_sales (91 sold units, buyer + contract value) ───
INSERT INTO public.unit_sales (unit_id, status, buyer_name, sold_price, discount_amount, spa_status, oqood_status)
SELECT u.id, 'sold', v.buyer_name, v.contract_value, v.discount_amount, 'not_signed', 'not_registered'
FROM public.units u
JOIN (VALUES
  ('101', 'Mubarak Bala Hassan',                                        586000,       0),
  ('102', 'Margareta Stahl',                                            586000,       0),
  ('103', 'Andre Alberto Van Balen Rubio',                              588000,       0),
  ('104', 'Arnaud Claude Ruelle',                                      1040000,       0),
  ('105', 'Jan Kvapil',                                                 589000,       0),
  ('106', 'Alina Ondubaeva',                                            591000,       0),
  ('107', 'Erika Soos',                                                 545600,   47400),
  ('109', 'Faris Awni Ismail',                                          607000,       0),
  ('110', 'Ali Mahmoud El Kouati',                                      614000,       0),
  ('111', 'Sami Karahan',                                              1152000,       0),
  ('112', 'Jean Marc Bonato',                                          1220000,       0),
  ('201', 'Rosemary Puno Bautista',                                     537280,   46720),
  ('202', 'Sawsane Bendriss',                                           586000,       0),
  ('203', 'Iliayana Georgieva Georgieva',                               588000,       0),
  ('204', 'Mohamed Aaquib Abdul Raheem',                                902000,       0),
  ('205', 'Lucia Conde Blanco',                                         675000,       0),
  ('206', 'Akram Humayun Muhammad Ghulam',                              620000,       0),
  ('207', 'Petr Stanek',                                                625000,       0),
  ('208', 'Martine Michele Clement',                                   1030000,       0),
  ('209', 'Ihab Sayigh',                                                661500,       0),
  ('210', 'Olga Rusu',                                                  608000,       0),
  ('211', 'Vaseem Haq',                                                 978000,       0),
  ('212', 'Martin Wohanka',                                             906000,       0),
  ('214', 'Isabell Gopfert',                                           1239000,       0),
  ('301', 'Faisal Abdulsamad Abdulghani Ahmed Alqannati',               614000,       0),
  ('302', 'Auwal Ahmed Jibril',                                         590000,       0),
  ('303', 'Hanna Baranko',                                              675000,       0),
  ('304', 'Roberto Dramis',                                             910000,       0),
  ('305', 'Nicola Kay Mccoy',                                           592000,       0),
  ('306', 'Khawla Munem Hamoudi Hamoudi',                               595000,       0),
  ('307', 'David Lastovka',                                             597000,       0),
  ('308', 'Mustufa E Rangoonwala / Vipul Pande',                        841000,  198000),
  ('309', 'Pedro Fernandez Sanchez',                                    683000,       0),
  ('310', 'Syed Fahd Hayat',                                            692000,       0),
  ('311', 'Mustufa E Rangoonwala / Vipul Pande',                        831000,  154000),
  ('312', 'Satish Kumar Prabhakar',                                     913000,       0),
  ('313', 'Andre Mahmoud Maan El Darwich',                              986000,       0),
  ('314', 'Faiq Mehtab',                                                930120,   80880),
  ('401', 'Afeez Babawale Subair',                                      619000,       0),
  ('402', 'Hima Sagar Tamatam',                                         593000,       0),
  ('403', 'Samuel Thymuriyil Abraham',                                  596000,       0),
  ('404', 'Mustufa E Rangoonwala / Vipul Pande',                        780000,  130000),
  ('405', 'Svetlana Gorbova',                                           596000,       0),
  ('406', 'Racha Daher Mohamad',                                        599000,       0),
  ('407', 'Ravel Winston Evans',                                        610000,       0),
  ('409', 'Varun Mehrotra',                                             684000,       0),
  ('410', 'Javier Pladevall Molina',                                    692000,       0),
  ('411', 'Manpreet Kaur',                                              967000,   25000),
  ('412', 'Kuljit Kumar Bhangu',                                        919000,       0),
  ('413', 'Saer Issam Bannout',                                         994000,       0),
  ('414', 'Tanvirabanu Anish Vijapura Sirajbhai Abdulraheman Tambadia',1107200,  150800),
  ('501', 'Saleh Abdulla Ahmed Abdulla Alshehhi',                       611820,    6180),
  ('502', 'Pierre Emile Augustin Grebaut',                              593000,       0),
  ('503', 'Jeanette Vassilev - Dontschev',                              597000,       0),
  ('504', 'Praneeth Vanteru',                                           900900,    9100),
  ('505', 'Jose Gregorio Tineo Perales',                                566200,   29800),
  ('506', 'Franciso Antonio Soldado Carrera',                           599000,       0),
  ('507', 'Andreas Norbert Braack',                                     601000,       0),
  ('509', 'Ayotunde Olusegun Omosebi',                                  666390,   20610),
  ('510', 'David Barta',                                                696000,       0),
  ('511', 'Paresh Gupta',                                               992000,       0),
  ('512', 'Tyrone Kyle Michael Herbert',                                919000,       0),
  ('513', 'Naajya Ahmed',                                               925000,   68000),
  ('514', 'Ali Yahaya Saleh',                                          1019000,       0),
  ('601', 'Rashd Sulaiman Obaid Hamad Alzaabi',                         623000,       0),
  ('602', 'Maher Nizar Majzoub',                                        598000,       0),
  ('603', 'Miguel Angel sanchez Jimenez',                               582970,   18030),
  ('604', 'Yasamin Baradaranzerehshooran',                              968060,   29940),
  ('605', 'Enrique Mario Soltanik',                                     601000,       0),
  ('606', 'Cenk Ilman',                                                 603000,       0),
  ('607', 'Jan Nahlovsky',                                              604000,       0),
  ('608', 'Abdelmajid El Bouazzati',                                   1010355,   36645),
  ('609', 'Gabriele Dewald',                                            689000,       0),
  ('610', 'Mario Junior Garcia Chambi',                                 695000,       0),
  ('611', 'Hasmukh Vitthalbhai Ramani',                                 999000,       0),
  ('612', 'William Malcolm Bailey',                                     926000,       0),
  ('613', 'Vinod Sancheti',                                            1001000,       0),
  ('614', 'Georgi Stefanov Obreshkov',                                 1266000,       0),
  ('701', 'Paulo Jorge Marques Pereira De Oliveira',                    622000,       0),
  ('702', 'Dawid Wojciech Przybysz',                                    598000,       0),
  ('703', 'Ashiq Abdul Raheem',                                         601000,       0),
  ('705', 'Aneera Ali',                                                 582000,   18000),
  ('706', 'Iliya Asenov Malinov',                                       602000,       0),
  ('707', 'Asyu Veselinov Atanasov',                                    660000,       0),
  ('708', 'Demjan Befus',                                              1003200,   52800),
  ('709', 'Lucas Pfennig',                                              692000,       0),
  ('710', 'Juan Luis Martin Sevillano',                                 700000,       0),
  ('711', 'Sunil Agarwal',                                              999000,       0),
  ('712', 'Sara Dominidiato',                                           898220,   27780),
  ('713', 'Scott Shepherd',                                            1001000,       0),
  ('714', 'Fahad Labaran Tanko',                                        943920,   82080)
) AS v(unit_no, buyer_name, contract_value, discount_amount)
ON u.unit_no = v.unit_no
   AND u.project_id = '00000000-0000-0000-0000-000000000001';

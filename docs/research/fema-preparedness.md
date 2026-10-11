# FEMA preparedness research

Sourced dataset for the FEMA region work (#43) and the item catalog (#44). Part of #39, closes #40.

- Researched 2026-10-11.
- Every claim ends with one or more source ids in square brackets, such as `[ready-kit]`. The ids resolve to entries in [`packages/shared/src/data/sources.ts`](../../packages/shared/src/data/sources.ts), which hold the title, publisher, URL and access date.
- Quotes are verbatim from the source. Anything not quoted is a paraphrase of the cited source.
- **Derived** marks a number computed here from sourced inputs. It is not a published figure.
- **Disagreement** and **Uncertain** mark the places where sources conflict or where a fact could not be verified. Nothing has been silently resolved.

## 1. The ten FEMA regions

FEMA "consists of ten regions in the continental United States and territories" [fema-regions]. FEMA publishes region pages at both `/about/organization/region-N` and `/about/regions/region-N`. The region pages name the `/about/regions/` form as their own address, so the `fema-region-N` sources use that form [fema-regions] [fema-region-2].

| Region | States, territories and freely associated states                                                                                                     | Tribal Nations | Regional office                                                      | General contact                          | Source           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| 1      | CT, ME, MA, NH, RI, VT                                                                                                                               | 10             | Cambridge, MA (Regional Response Coordination Center in Maynard, MA) | fema-r1-info@fema.dhs.gov                | [fema-region-1]  |
| 2      | NJ, NY, Puerto Rico, U.S. Virgin Islands                                                                                                             | 8              | New York, NY                                                         | FEMA-R2-ExternalAffairs@fema.dhs.gov     | [fema-region-2]  |
| 3      | DE, DC, MD, PA, VA, WV                                                                                                                               | 7              | Philadelphia, PA                                                     | 215-931-5500                             | [fema-region-3]  |
| 4      | AL, FL, GA, KY, MS, NC, SC, TN                                                                                                                       | 6              | Atlanta, GA (Federal Regional Center in Thomasville, GA)             | 770-220-5200, FEMA-R4-Info@fema.dhs.gov  | [fema-region-4]  |
| 5      | IL, IN, MI, MN, OH, WI                                                                                                                               | 34             | Chicago, IL                                                          | 312-408-5500, fema-r5-info@fema.dhs.gov  | [fema-region-5]  |
| 6      | AR, LA, NM, OK, TX                                                                                                                                   | 68             | Denton, TX                                                           | 940-898-5399                             | [fema-region-6]  |
| 7      | IA, KS, MO, NE                                                                                                                                       | 9              | Kansas City, MO                                                      | 816-283-7061                             | [fema-region-7]  |
| 8      | CO, MT, ND, SD, UT, WY                                                                                                                               | 29             | Denver, CO                                                           | 303-235-4800                             | [fema-region-8]  |
| 9      | AZ, CA, HI, NV, Guam, American Samoa, Commonwealth of the Northern Mariana Islands, Republic of the Marshall Islands, Federated States of Micronesia | 150            | Oakland, CA                                                          | 510-627-7100                             | [fema-region-9]  |
| 10     | AK, ID, OR, WA                                                                                                                                       | 271            | Bothell, WA                                                          | 425-487-4600, FEMA-R10-Info@fema.dhs.gov | [fema-region-10] |

The state and territory lists match between [fema-regions] and each region page.

The official contact URL for each region is its region page; see the URL for that region's id in `sources.ts`.

**Uncertain:**

- No region page gives a street address.
- The Region 2 and Region 3 pages list no general phone number. Regions 3, 6, 7, 8 and 9 list no general email.
- Tribal Nation counts are as stated on the region pages. Region 7 does not name its nine Nations.

## 2. Dominant hazards per region

### 2.1 Method

The National Risk Index (NRI) "provides information for communities most at risk to 18 different natural hazards". It is measured "at the Census tract or county level" and combines "expected annual loss, social vulnerability and community resilience" [fema-nri].

The current data release is v1.20 (December 2025) [fema-nri-data]. Its 18 hazards are: avalanche, coastal flooding, cold wave, drought, earthquake, hail, heat wave, hurricane, ice storm, inland flooding, landslide, lightning, strong wind, tornado, tsunami, volcanic activity, wildfire and winter weather [fema-nri-data].

FEMA does not publish a region-level NRI table. The region ranking below is **derived**. It sums each hazard's `*_EALT` field ("Expected Annual Loss - Total", in dollars) across every state and territory in the region, using the v1.20 "All States and Territories" table [fema-nri-data].

**Caveats on the derived ranking:**

- Expected annual loss measures dollars, not how often a hazard happens. It is weighted toward high-value, densely built areas, and it does not include social vulnerability or community resilience. The NRI's composite Risk Index does include those factors [fema-nri].
- Population losses in EAL are converted to dollars. This is why hazards that cause deaths, such as heat wave and cold wave, rank above hazards that mainly damage property.
- The Republic of the Marshall Islands and the Federated States of Micronesia are in Region 9 [fema-regions] but have no rows in the NRI state table [fema-nri-data]. Region 9 figures exclude them.
- NRI "Winter Weather" is a separate hazard from "Cold Wave" and "Ice Storm" [fema-nri-data]. Read the three together when judging winter risk.

### 2.2 Top hazards by expected annual loss (derived from [fema-nri-data])

Shares are each hazard's percentage of the region's total EAL across all 18 hazards.

| Region | Total EAL | 1st                   | 2nd                   | 3rd              | 4th             | 5th                   |
| ------ | --------- | --------------------- | --------------------- | ---------------- | --------------- | --------------------- |
| 1      | $4.01B    | Inland flooding 65.2% | Hurricane 13.1%       | Earthquake 4.1%  | Cold wave 4.0%  | Coastal flooding 3.2% |
| 2      | $10.99B   | Inland flooding 46.4% | Hurricane 18.2%       | Earthquake 11.2% | Cold wave 4.1%  | Tsunami 4.0%          |
| 3      | $8.78B    | Inland flooding 63.5% | Heat wave 7.5%        | Hurricane 6.8%   | Cold wave 5.3%  | Earthquake 4.3%       |
| 4      | $29.06B   | Inland flooding 38.6% | Hurricane 27.7%       | Tornado 10.2%    | Earthquake 6.5% | Cold wave 5.9%        |
| 5      | $19.86B   | Inland flooding 50.3% | Cold wave 18.1%       | Tornado 14.1%    | Heat wave 4.2%  | Strong wind 3.8%      |
| 6      | $20.56B   | Inland flooding 38.2% | Tornado 16.0%         | Hurricane 13.8%  | Cold wave 7.8%  | Heat wave 6.5%        |
| 7      | $8.89B    | Inland flooding 37.5% | Tornado 15.8%         | Heat wave 10.2%  | Cold wave 8.5%  | Hail 7.6%             |
| 8      | $6.03B    | Inland flooding 35.6% | Earthquake 16.8%      | Cold wave 13.5%  | Wildfire 9.3%   | Hail 7.7%             |
| 9      | $36.58B   | Earthquake 42.7%      | Inland flooding 40.4% | Wildfire 6.1%    | Heat wave 5.1%  | Drought 2.8%          |
| 10     | $8.85B    | Earthquake 50.3%      | Inland flooding 29.7% | Wildfire 5.4%    | Tsunami 4.8%    | Cold wave 3.6%        |

Expected annual loss for hazards named in the issue that do not appear in the top five above (derived from [fema-nri-data]):

- **Hurricane:** Region 9 $183M (0.5%). Regions 5, 7, 8 and 10 have near zero.
- **Wildfire:** Region 6 $320M (1.6%) and Region 4 $187M (0.6%). Every other region outside 8, 9 and 10 is under $100M.
- **Winter weather:** at most 1.6% of any region's EAL. The highest is Region 8 at $99M.
- **Volcanic activity:** Region 9 $31M and Region 10 $29M. Every other region has zero.

### 2.3 What FEMA and Ready.gov say about where hazards occur

- **Flood:** "Where it rains it can flood," and "flooding doesn't follow lines on a map" [ready-floods]. The Region 3 page calls flooding "the most common natural disaster in Region 3" [fema-region-3]. Region pages promote FEMA's Risk MAP flood-risk program [fema-region-1] [fema-region-4] [fema-region-5] [fema-region-7].
- **Hurricane:** Hurricanes "can happen along any U.S. coast or in any territory in the Atlantic or Pacific oceans." Atlantic season runs June 1 to November 30, Eastern Pacific May 15 to November 30, and Central Pacific June 1 to November 30 [ready-hurricanes].
- **Tornado:** "In the U.S., the Midwest and the Southeast have a greater risk for tornadoes," but they can "happen anytime and anywhere" [ready-tornadoes].
- **Volcano:** "There are 161 potentially active volcanoes in the United States." "Alaska, Hawaii, California, Washington and Oregon have the largest number of active volcanoes" [ready-volcanoes].
- **Tsunami:** Tsunamis can "happen anywhere along U.S. coasts." "Coasts that border the Pacific Ocean or Caribbean have the greatest risk" [ready-tsunamis].
- **Extreme heat:** "Older adults, children and people with certain illnesses and chronic conditions are at greater risk from extreme heat" [ready-heat].
- **Earthquake and wildfire:** The Ready.gov pages name no US regions. Wildfires are described only as "unplanned fires that burn out of control in natural areas like forests, grasslands or prairies" [ready-earthquakes] [ready-wildfires]. Use the NRI figures above.
- **Recent declarations on region pages** (useful as context, not as a ranking):
  - Region 4: Hurricane Isaias storm surge [fema-region-4]
  - Region 6: Gulf Coast hurricane winds and Oklahoma straight-line winds [fema-region-6]
  - Region 8: Utah flooding, mudslides and the Cottonwood Fire [fema-region-8]
  - Region 9: hurricanes, Super Typhoon Bavi and wildfires [fema-region-9]
  - Region 10: ex-Typhoon Halong in Alaska, and seismic mitigation guides [fema-region-10]

**Disagreement:**

- **Wildfire in Region 9.** Wildfire is visible on the Region 9 page [fema-region-9] but is only 6.1% of Region 9's EAL [fema-nri-data]. Earthquake and inland flooding dominate the loss figures.
- **Tornado in the Southeast.** Ready.gov singles out the Southeast for tornadoes [ready-tornadoes]. In Region 4, tornado ranks third by EAL, behind flooding and hurricanes [fema-nri-data].
- **Winter weather.** NRI winter weather EAL is small in every region [fema-nri-data]. Cold wave ranks in the top five in nine of ten regions; Region 9 is the exception. Winter-kit guidance [ready-winter-weather] should be keyed to cold wave and ice storm as well as winter weather.

## 3. Basic kit (Ready.gov)

The current Ready.gov "Basic Disaster Supplies Kit" [ready-kit]:

- Water: "one gallon per person per day for several days, for drinking and sanitation"
- Food: "at least a several-day supply of non-perishable food"
- "Battery-powered or hand crank radio and a NOAA Weather Radio with tone alert"
- Flashlight
- First aid kit
- Extra batteries
- Whistle ("to signal for help")
- Dust mask ("to help filter contaminated air")
- "Plastic sheeting, scissors and duct tape (to shelter in place)"
- "Moist towelettes, garbage bags and plastic ties (for personal sanitation)"
- "Wrench or pliers (to turn off utilities)"
- Manual can opener
- Local maps
- "Cell phone with chargers and a backup battery"

"Additional Emergency Supplies" on the same page [ready-kit]:

- Soap, hand sanitizer and disinfecting wipes
- Prescription medications
- Non-prescription medications: "pain relievers, anti-diarrhea medication, antacids or laxatives"
- Prescription eyeglasses and contact lens solution
- "Infant formula, bottles, diapers, wipes and diaper rash cream"
- "Pet food and extra water for your pet"
- Cash or traveler's checks
- Important family documents: "copies of insurance policies, identification and bank account records"
- Sleeping bag or warm blanket for each person
- "Complete change of clothing appropriate for your climate and sturdy shoes"
- Fire extinguisher
- Matches in a waterproof container
- Feminine supplies and personal hygiene items
- "Mess kits, paper cups, plates, paper towels and plastic utensils"
- Paper and pencil
- "Books, games, puzzles or other activities for children"

## 4. Per-person quantities and duration

### 4.1 Water

- "Store at least one gallon of water per person per day for several days, for drinking and sanitation" [ready-water] [ready-kit].
- "A normally active person needs about three quarters of a gallon of fluid daily, from water and other beverages" [ready-water].
- "Children, nursing mothers and sick people may need more water." "In very hot temperatures, water needs can double." "A medical emergency might require additional water" [ready-water].
- The older FEMA 477 publication puts drinking needs at "at least two quarts (half gallon) of water each day," and says to "Store at least one gallon per person, per day" [fema-food-water-2004].

**Disagreement:** Daily drinking need is about three quarters of a gallon in [ready-water] and "at least two quarts (half gallon)" in [fema-food-water-2004]. The one-gallon storage figure is the same in both.

### 4.2 Food

- "Store at least a several-day supply of non-perishable food" [ready-food] [ready-kit].
- "Remember any special dietary needs" [ready-food].

### 4.3 Duration: 72 hours compared with 2 weeks

| Source                                   | Date        | Water                                                                                                                                                                        | Food                                                                                                                                                                                                          |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ready-kit], [ready-water], [ready-food] | current     | "for several days"                                                                                                                                                           | "at least a several-day supply"                                                                                                                                                                               |
| [fema-food-water-2004]                   | August 2004 | Kit: "Three-day supply of water (one gallon of water per person, per day)". Stockpile: "Consider storing at least a two-week supply of water for each member of your family" | Kit: "Three-day supply of nonperishable food". Stockpile: "Even though it is unlikely that an emergency would cut off your food supply for two weeks, consider maintaining a supply that will last that long" |
| [fema-evac-sip-planning]                 | July 2019   | Shelter in place: "self-sustainment in that location for a minimum of 72 hours and a maximum of 14 days" (water, food, medications, medical equipment)                       | same                                                                                                                                                                                                          |

**Disagreement:** The current Ready.gov pages give no number of days and say only "several days" [ready-kit] [ready-water] [ready-food]. Older FEMA material says three days for the go-kit and two weeks for the home stockpile [fema-food-water-2004]. FEMA's 2019 planning guidance frames 72 hours as the minimum and 14 days as the maximum [fema-evac-sip-planning].

**Uncertain:** No current FEMA page found during this research states that FEMA withdrew the three-day figure. "Several days" may be a loosening of the language rather than a change in the number.

**Suggested catalog reading (not a source claim):** treat 3 days (72 hours) as the go-kit floor and 2 weeks as the shelter-in-place ceiling. Cite both [fema-food-water-2004] and [fema-evac-sip-planning], alongside the current "several days" [ready-kit].

**Derived:** At 1 gal/person/day [ready-water], 3 days is 3 gal per person and 14 days is 14 gal per person.

## 5. Hazard-specific additions

| Hazard         | Additions or emphasis                                                                                                                                                                                                                                                                           | Source                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Hurricane      | "Include medication, disinfectant supplies and pet supplies in your go bag or car trunk." "Purchase backup charging devices to power electronics." You "may not have access to these supplies for days or even weeks."                                                                          | [ready-hurricanes]     |
| Wildfire       | "If available, store an N95 mask to protect yourself from smoke inhalation." Keep a first aid kit in your go bag or car trunk. Backup charging devices.                                                                                                                                         | [ready-wildfires]      |
| Earthquake     | "Make a supply kit that includes enough food and water for several days, a flashlight, a fire extinguisher and a whistle."                                                                                                                                                                      | [ready-earthquakes]    |
| Winter weather | Car kit: "jumper cables, sand, a flashlight, warm clothes, blankets, bottled water and non-perishable snacks." "Keep a full tank of gas." Supplies "in case you need to stay home for several days without power." Generators "at least 20 feet away from windows, doors and attached garages." | [ready-winter-weather] |
| Flood          | Supplies "for several days." "Keep documents in a waterproof container."                                                                                                                                                                                                                        | [ready-floods]         |
| Tornado        | Stock "emergency supplies, cleaning supplies, non-perishable foods, water, medical supplies and medication" for sheltering in place.                                                                                                                                                            | [ready-tornadoes]      |
| Extreme heat   | No kit list. "Drink plenty of fluids." "Do not rely on a fan as your primary cooling device." Give pets "plenty of cool water and access to comfortable shade."                                                                                                                                 | [ready-heat]           |
| Volcano        | Supplies "for several days." "Use a well-fitting, certified face mask, such as an N95." Dust or cloth mask "as a last resort." Goggles are not mentioned.                                                                                                                                       | [ready-volcanoes]      |
| Tsunami        | The page has no supply guidance; it only links to Build a Kit.                                                                                                                                                                                                                                  | [ready-tsunamis]       |

**Disagreement:** The basic kit lists a "dust mask" [ready-kit]. The wildfire and volcano pages call for an N95 [ready-wildfires] [ready-volcanoes]. The catalog should treat N95 as the hazard-specific upgrade.

## 6. Specific needs

### 6.1 Infants

- Kit: "Infant formula, bottles, diapers, wipes and diaper rash cream" [ready-kit].
- "Use ready-to-feed formula. If you must mix infant formula use bottled water or boiled water as a last resort" [ready-food].
- Older guidance: "Nursing mothers may need liquid formula, in case they are unable to nurse" [fema-food-water-2004].

**Uncertain:** No source gives infant quantities, such as diapers or formula per day.

### 6.2 Older adults

- "Plan for food, water, and essentials for you and pets or service animals" [ready-older-adults].
- "Include items that meet your individual needs, such as medicines, medical supplies, batteries and chargers" [ready-older-adults].
- "Make copies of Medicaid, Medicare, and other insurance cards" [ready-older-adults].
- "Not all shelters accept pets, so plan for alternatives" [ready-older-adults].

### 6.3 Medical needs and disabilities

- "Several days supply of prescription medicines" [ready-disability].
- "Talk to your doctor or pharmacist about how you can create an emergency supply of medicines" [ready-disability].
- "Purchase an extra battery for a power wheelchair or other battery-operated medical or assistive technology devices." "Keep extra batteries charged at all times." "Extra hearing-aid batteries" [ready-disability].
- Documents: "A list of all medications, dosage and any allergies", "A list of the style and serial number of medical devices", and "Copies of insurance and Medicare cards" [ready-disability].
- For power-dependent equipment, ask your power provider "to put you on a list for priority power restoration" [ready-disability].
- "About half of all Americans take a prescription medicine every day" [ready-kit].

**Uncertain:** No current page gives a number of days for medication beyond "several days" [ready-disability]. The 2019 planning document groups medications and medical equipment under the 72-hour to 14-day shelter-in-place window [fema-evac-sip-planning].

### 6.4 Pets

All quoted from [ready-pets]:

- "Keep several days' supply of food in an airtight, waterproof container."
- "Store a water bowl and several days' supply of water."
- "Keep an extra supply of the medicine your pet takes on a regular basis in a waterproof container."
- A pet first aid kit; "talk to your veterinarian."
- "Include a backup leash, collar and ID tag."
- "Traveling bag, crate or sturdy carrier, ideally one for each pet."
- Grooming items.
- Sanitation: "pet litter and litter box (if appropriate), newspapers, paper towels, plastic trash bags and household chlorine bleach."
- "A picture of you and your pet together."
- Favorite toys, treats or bedding.

The basic kit adds "Pet food and extra water for your pet" [ready-kit].

**Uncertain:** No source gives a per-pet water quantity.

## 7. HDX 27 Gal. Tough Storage Tote (Model 999-27G-HDX)

This is the only product named in this research. It is the container the app packs into. HDX is a Home Depot brand, so the Home Depot listing is the manufacturer page [hd-hdx-27gal-tote].

| Attribute           | Value                             | Status                                         |
| ------------------- | --------------------------------- | ---------------------------------------------- |
| Nominal capacity    | 27 gal                            | From the product name only [hd-hdx-27gal-tote] |
| Model number        | 999-27G-HDX, Internet # 327528802 | From the product URL [hd-hdx-27gal-tote]       |
| Exterior dimensions | Unverified                        | See below                                      |
| Interior dimensions | Unverified                        | See below                                      |
| Usable volume       | Unverified                        | See below                                      |

**Uncertain:** The Home Depot product page, its Q&A pages and its review pages all returned HTTP 403 to automated requests on 2026-10-11. The manufacturer spec table could not be read, so this document does not state any dimension as fact. A person should open the product page in a browser, copy the **Specifications** section into this document, and set `accessed` on `hd-hdx-27gal-tote` in `sources.ts`.

**Leads to check, not citable:** These figures come from non-manufacturer third-party listings found by web search. They fail the acceptance criteria and must not be quoted until checked against [hd-hdx-27gal-tote].

- Exterior: about 28.55 in L × 19.61 in W × 15.27 in H. Several third-party listings agree on this.
- Interior: the listings disagree with each other:
  - 23.5 × 14.5 × 13 in (measured at the bottom)
  - 22.98 × 14.02 × 14.30 in
  - an interior height of 12.69 in, attributed to a Home Depot Q&A answer

**Derived, unverified inputs:** 27 gal is 6,237 in³ (27 × 231 in³/gal). A 23.5 × 14.5 × 13 in box is about 4,430 in³, or about 19.2 gal. The walls taper, so the bottom footprint understates true volume. Still, this suggests the rectangular volume usable for packing boxed goods is well under the nominal 27 gal. Treat the nominal figure as brim capacity until the spec sheet is verified.

## 8. Open questions for #43 and #44

1. Verify the tote dimensions from the Home Depot specifications tab (section 7).
2. Decide between 72 hours and 2 weeks for default quantities (section 4.3). Both are sourced.
3. EAL-based hazard rankings favor dollar losses. If #43 needs a "most likely to happen" ranking, recompute from NRI annualized frequency (`*_AFREQ`) instead [fema-nri-data].
4. The Ready.gov hazard pages give few region-specific statements. Earthquake and wildfire geography currently rests only on NRI [fema-nri-data].

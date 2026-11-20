#!/usr/bin/env python3
"""Build and preview Vendvision’s static marketing site using Python's standard library."""
import argparse
from machine_catalogue import make_catalogue
from functools import partial
from html import escape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import shutil
from urllib.parse import parse_qs, urlsplit
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / 'content/business.json').read_text())
ORIGIN = DATA['canonical']
ADS = '/vending-machine-advertising-malaysia/'
MACHINES = '/services.html'
WA = 'https://wa.me/' + DATA['whatsapp']
EMAIL = 'mailto:' + DATA['email']
ARTICLES = sorted(
    [json.loads(file.read_text()) for file in (ROOT / 'content').glob('*.json') if file.name != 'business.json'],
    key=lambda article: article['order']
)
PAGES = {}


def button(label, url, secondary=False):
    return f'<a class="button{" secondary" if secondary else ""}" href="{escape(url)}">{escape(label)} <span aria-hidden="true">↗</span></a>'


def page(path, title, description, body, service=None, article=None, index=True):
    PAGES[path] = (title, description, body, service, article, index)


PHOTO_DESCRIPTIONS = {'collection.webp': 'Shopper collecting a chilled can from a vending tray',
 'restocking.webp': 'Operator refilling a row of chilled drinks',
 'site-survey.webp': 'Building managers assessing a lobby for vending placement',
 'office-pantry.webp': 'Colleagues choosing drinks during an office pantry break',
 'fleet-review.webp': 'Operator reviewing stock and sales on a tablet, illustrative screen',
 'pack-fit.webp': 'Drink packs and measuring tape for a vending fit check',
 'energy-check.webp': 'Checking power consumption at a refrigerated cabinet',
 'cost-review.webp': 'Planning machine costs with receipts and a calculator',
 'creative-studio.webp': 'Preparing a beverage photograph for a screen campaign',
 '50sp-vendvision.webp': 'Vendvision full-front touchscreen machine in two catalogue views',
 'extracted-p2-0.jpeg': 'The Vendvision team',
 'founder.jpg': 'Melvin Chan, Vendvision founder',
 'v22-lobby-560.webp': 'V22 vending machine in an illustrative lobby campaign'}

def photo(filename, eager=False):
    loading = 'eager' if eager else 'lazy'
    return f'<img src="/assets/{filename}" alt="{escape(PHOTO_DESCRIPTIONS[filename])}" loading="{loading}" decoding="async">'


def intro(kicker, title, description, action='', image=None):
    copy = f'<div class="intro-copy"><p class="eyebrow">{kicker}</p><h1>{title}</h1><p class="lead">{description}</p>{action}</div>'
    visual = f'<figure class="intro-photo">{photo(image, eager=True)}</figure>' if image else ''
    return f'<section class="intro"><div class="wrap">{copy}{visual}</div></section>'


def section(title, body, tone='', anchor=''):
    return f'<section class="section {tone}"{f" id={chr(34)}{anchor}{chr(34)}" if anchor else ""}><div class="wrap"><h2>{title}</h2>{body}</div></section>'


def cards(items, images=()):
    return '<div class="cards">' + ''.join(
        f'<article class="card">{photo(images[i]) if images else ""}<h3>{title}</h3><p>{description}</p>{link}</article>'
        for i, (title, description, link) in enumerate(items)
    ) + '</div>'


def link(label, href):
    return f'<a class="text-link" href="{href}">{label} <span aria-hidden="true">↗</span></a>'


def steps(items):
    return '<ol class="steps">' + ''.join(
        f'<li><h3>{title}</h3><p>{body}</p></li>' for title, body in items
    ) + '</ol>'


def field(label, kind='text', optional=False, options=()):
    required = '' if optional else ' required'
    caption = label + (' (optional)' if optional else '')
    attrs = f'name="{escape(label)}"{required}'
    if options:
        control = f'<select {attrs}><option value="">Select an option</option>' + ''.join(
            f'<option>{escape(option)}</option>' for option in options
        ) + '</select>'
    elif kind == 'textarea':
        control = f'<textarea {attrs} rows="3" maxlength="600"></textarea>'
    else:
        autocomplete = {'email': 'email', 'tel': 'tel'}.get(kind, 'name' if label == 'Your name' else 'off')
        control = f'<input {attrs} type="{kind}" autocomplete="{autocomplete}" maxlength="160">'
    return f'<label><span>{escape(caption)}</span>{control}</label>'


ENQUIRY_EMAIL = 'hello@vendvision.co'


def enquiry(anchor, title, description, journey, fields):
    return f'''<section class="section form-section" id="{anchor}"><div class="wrap form-layout">
      <div><p class="eyebrow">Talk to Vendvision</p><h2>{title}</h2><p>{description}</p>
      <p><a href="mailto:{ENQUIRY_EMAIL}">{ENQUIRY_EMAIL}</a><br><a href="{WA}">WhatsApp {DATA['phone_display']}</a></p></div>
      <div><form data-enquiry="{journey}" data-subject="{escape(title)}" hidden>
        <p class="form-note">Compose your enquiry here, then send it from WhatsApp or your email app.</p>
        <div class="fields">{field('Your name')}{field('Work email', 'email')}{fields}</div>
        <div class="actions"><button class="button" type="submit" name="channel" value="whatsapp">Continue to WhatsApp</button>
        <button class="button secondary" type="submit" name="channel" value="email">Open email draft</button></div>
        <p class="delivery-status" role="status" hidden></p>
      </form><noscript><p>Send the details above by email or WhatsApp.</p></noscript></div>
    </div></section>'''


def campaign_image(hero=False):
    loading = 'fetchpriority="high"' if hero else 'loading="lazy"'
    return f'''<figure class="campaign-figure"><img src="/assets/v22-lobby-1120.webp"
        srcset="/assets/v22-lobby-560.webp 560w, /assets/v22-lobby-1120.webp 1120w"
        sizes="(max-width: 760px) calc(100vw - 36px), 560px" width="1120" height="1400"
        alt="Vendvision V22 with a fuchsia wrap and a beverage ad on its right-hand touchscreen in an illustrative office lobby"
        {loading}><figcaption>V22  /  Illustrative beverage campaign</figcaption></figure>'''


def insight_url(slug):
    return f'/insights/{slug}/'


def insight_links(slugs):
    by_slug = {article['slug']: article for article in ARTICLES}
    return '<ul class="insight-links">' + ''.join(
        f'<li>{link(escape(by_slug[slug]["title"]), insight_url(slug))}</li>' for slug in slugs
    ) + '</ul>'


def machine_comparison():
    photos = {'V22': 'v22-reference.png', '50SP': '50sp-vendvision.webp'}
    cards = []
    for model in DATA['models']:
        name = escape(model['name'])
        cards.append(f"""<article class="compare-model" data-model="{name}">
          <div class="compare-info"><h3>{name}</h3><p>{escape(model['display'])}</p>
          <dl><dt>Product choices</dt><dd>Up to {model['choices']}</dd>
          <dt>Capacity</dt><dd>Approx. {model['capacity']} items</dd></dl></div>
          <div class="compare-image"><img src="/assets/{photos[name]}" loading="lazy"
               alt="Vendvision {name} vending machine"></div></article>""")
    return f"""<section class="section machine-comparison" id="compare-machines">
      <div class="wrap"><div class="compare-heading"><h2>Vending machines</h2>
      {link('Compare full specifications', MACHINES + '#model-specs')}</div>
      <div class="compare-pair">{''.join(cards)}</div></div></section>"""


def make_pages():
    make_catalogue(page)
    page('/', 'Vendvision | Vending Machines & Retail Media Malaysia',
         'Plan a vending machine advertising campaign with the Vendvision Brand Network or compare Malaysian smart vending machines and request a quotation.',
         f'''<section class="home-hero"><div class="wrap hero-grid"><div class="hero-copy">
         <p class="eyebrow">Vendvision Brand Network</p>
         <h1>Seen on screen.<br><em>Bought on site.</em></h1>
         <p class="lead">Bring your brand to vending machines across Malaysia. Reach shoppers on screen, then put your product within reach.</p>
         <div class="actions">{button('Plan a campaign', ADS)}{button('Explore vending machines', MACHINES, True)}</div>
         <div class="hero-partners">{link('For vending operators', '/operators/')}{link('Propose a vending location', '/propose-a-site/')}</div>
         </div>{campaign_image(hero=True)}</div></section>''' +
         section('Three ways to reach shoppers', cards([
             ('Screen advertising', 'Run creative on screens at participating machines. Choose target areas, venue types and campaign dates.', link('Explore screen advertising', ADS + '#formats')),
             ('Product placement', 'Put a suitable drink or snack on sale in a participating machine. Confirm pack fit, temperature and restocking.', link('Explore product placement', ADS + '#formats')),
             ('Combined campaigns', 'Show the campaign and stock the featured product at the same machine so shoppers can buy on the spot.', link('See a campaign example', ADS + '#example'))
         ], ('creative-studio.webp', 'pack-fit.webp', 'collection.webp'))) +
         machine_comparison() +
         section('Work with Vendvision', cards([
             ('Vending operators', 'Put existing machines forward for campaign review.', link('Check machine eligibility', '/operators/')),
             ('Locations and corporate pantries', 'Submit a property or request an office pantry proposal.', link('Explore location options', '/locations/')),
             ('VendBI software', 'Monitor sales, stock and machine status across your operation.', link('Explore VendBI', '/vendbi/'))
         ], ('restocking.webp', 'site-survey.webp', 'fleet-review.webp'))))

    example = DATA['campaign_example']
    page(ADS, 'Vending Machine Advertising in Malaysia | Vendvision',
         'Book screen advertising, product placement or combined vending campaigns with Vendvision. Explore formats and request a Klang Valley campaign plan.',
         intro('Brands & agencies', 'Vending machine advertising in Malaysia',
               'Run a screen ad, stock a product, or combine both. Share your audience, dates and preferred locations.',
               button('Request a campaign plan', '#campaign-plan'), image='creative-studio.webp') +
         section('Choose your campaign format', cards([
             ('Screen advertising', 'Run your creative on participating vending screens. Ask for a shortlist by area and venue type, with screen specifications and reporting options for each site.', ''),
             ('Product placement', 'Put a drink or snack on sale. We check pack dimensions, storage temperature, available slots and restocking arrangements with the operator.', ''),
             ('Combined campaign', 'Show the creative on a machine where shoppers can buy the featured product. Agree dates, stock availability and reporting before booking.', '')
         ]), anchor='formats') +
         section(example['title'], f'<p class="eyebrow example-label">Illustrative campaign</p><div class="example-grid"><div>'
                 + steps([('Brief', example['brief']), ('Setup', example['execution']), ('Reporting', example['measurement'])])
                 + '</div>' + campaign_image() + '</div>', 'tint', 'example') +
         section('From brief to booking', steps([
             ('Check fit and availability', DATA['coverage']['campaigns'] + ' We also check site permissions, operator participation, screen capability, product fit and stock responsibilities.'),
             ('Review the plan', 'Receive a proposed shortlist, recommended formats, creative requirements, indicative costs and the reporting available for each proposed site. Approve final dates, commercial terms and deliverables before booking.'),
             ('Run and report', 'Depending on the equipment and agreed scope, reports may include playback records, units sold and stockouts. Playback records count scheduled content plays where logged. Sales uplift requires a suitable baseline or comparison.')
         ])) +
         section('Campaign planning guides', insight_links(['vending-screen-campaign-brief',
                 'vending-product-placement-pilot', 'vending-retail-media-measurement'])) +
         enquiry('campaign-plan', 'Request a campaign plan', 'Share your audience, areas, campaign dates, product or creative format and indicative budget.', 'campaign',
                 field('Brand or agency') + field('Target audience and preferred areas') + field('Campaign dates') +
                 field('Format', options=('Screen advertising', 'Product placement', 'Combined', 'Help me choose')) +
                 field('Indicative budget in RM', optional=True) + field('Product or creative details', 'textarea', True)),
         service='Vending machine advertising')

    models = DATA['models']
    headings = ''.join(f'<th scope="col">{m["name"]}<small>{m["code"]}</small></th>' for m in models)
    specs = [
        ('Display', 'display'), ('Typical applications', 'application'), ('Dimensions (H × W × D)', 'dimensions'),
        ('Product choices (up to)', 'choices'), ('Approximate item capacity', 'capacity'),
        ('Refrigeration', 'temperature'), ('Payment options', 'payment')
    ]
    rows = ''.join(f'<tr><th scope="row">{label}</th>' + ''.join(f'<td>{escape(str(m[key]))}</td>' for m in models) + '</tr>' for label, key in specs)
    images = '''<figure class="model-photo"><img src="/assets/v22-reference.png" width="1120" height="1400"
        loading="lazy" alt="Vendvision catalogue machine with visible product rows and a side touchscreen">
        <figcaption>Visible products and side touchscreen</figcaption></figure>
        <figure class="model-photo"><img src="/assets/50sp-vendvision.webp" width="598" height="609"
        loading="lazy" alt="Vendvision catalogue machine with full-front touchscreen, shown from two angles">
        <figcaption>Full-front touchscreen</figcaption></figure>'''
    page(MACHINES, 'Vending Machines Malaysia | Models & Quotations | Vendvision',
         'Compare Vendvision V22 and 50SP vending machines in Malaysia, including capacity, dimensions, refrigeration and payment options. Request an itemised quote.',
         intro('Machine supply & support', 'Smart vending machines in Malaysia',
               'Compare two touchscreen models for drinks and snacks. Tell us what you plan to sell and where, and we’ll check the right configuration for your site.',
               button('Browse the full catalogue', '/machines/') + ' ' + button('Request a quote', '#machine-quote', True), image='50sp-vendvision.webp') +
         section('Compare the V22 and 50SP', '<div class="model-grid">' + images + '</div>'
                 '<div class="table-wrap" role="region" aria-label="Machine comparison" tabindex="0"><table id="model-specs"><caption>Published specifications</caption>'
                 f'<thead><tr><th scope="col">Specification</th>{headings}</tr></thead><tbody>{rows}</tbody></table></div>'
                 '<p class="note">Actual capacity depends on pack size and tray layout. Confirm payment hardware, supported methods and configuration in your quote.</p>') +
         section('What your quote covers', '<p>Ask for an itemised quotation showing the machine and tray configuration, payment hardware and processing setup, delivery and installation, onboarding, VendBI fees, warranty and servicing terms. Tell us if you want to discuss purchase or available financing terms.</p><p>For frozen products, coffee, assisted heating or other specialist applications, share the storage and dispensing requirements so we can check options.</p>', 'tint') +
         section('Aftersales service', '<p>Ask about preventive maintenance, remote diagnostics, onsite repair and parts. Share your postcode and model so we can confirm coverage and the support included in your plan.</p>' + link('Contact Vendvision for servicing', '/contact.html'), anchor='maintenance') +
         section('Guides for machine buyers', insight_links(['vending-machine-quote-checklist-malaysia',
                 'vending-machine-break-even-malaysia', '7-reasons-why-location-can-make-or-break-your-vending-machine-venture'])) +
         enquiry('machine-quote', 'Request a machine quote', 'Tell us your product mix, location status and city or postcode so we can quote the right setup.', 'machine_quote',
                 field('Model', options=tuple(m['name'] for m in models) + ('Specialist machine', 'Help me choose')) +
                 field('Do you already have a location?', options=('Yes, confirmed', 'Yes, still evaluating', 'No, looking for a site')) +
                 field('City or postcode') + field('Products and quantity', 'textarea')),
         service='Vending machine supply')

    page('/operators/', 'Vending Operator Partnerships | Vendvision Brand Network',
         'Put forward vending machines for screen advertising and product placement in Malaysia. Check eligibility and learn how campaigns are agreed.',
         intro('For vending operators', 'Put your machines forward for VBN',
               'Put your screens and product slots forward for brand campaigns in Malaysia.',
               button('Check my machines’ eligibility', '#operator-form'), image='restocking.webp') +
         section('How eligibility and booking work', steps([
             ('Share your fleet details', 'Tell us the number of machines, operating areas, model or platform, screen capability and whether you can stock and service campaign products.'),
             ('Review machine and site fit', 'We check site permissions, screen and content control, available slots and refrigeration, connectivity, stocking arrangements and reporting. Review starts with campaign briefs in the Klang Valley.'),
             ('Confirm each campaign', 'When a brief matches, review the machines, dates, deliverables, stock responsibilities, reporting and commercial terms. Campaign participation is agreed per booking.')
         ])) +
         section('Guides for operators', insight_links(['first-30-days-vending-machine',
                 '7-reasons-why-location-can-make-or-break-your-vending-machine-venture',
                 'the-green-future-of-vending'])) +
         enquiry('operator-form', 'Check my machines’ eligibility', 'Share your fleet and operating details for an eligibility review.', 'operator',
                 field('Operator or company') + field('Fleet size') + field('Operating areas') +
                 field('Screen capability', options=('Screens can run third-party creative', 'Machines have screens; capability uncertain', 'No screens', 'Mixed fleet')) +
                 field('Model, platform or stocking details', 'textarea', True)),
         service='Vending operator partnerships')

    page('/propose-a-site/', 'Propose a Vending Machine Location in Malaysia | Vendvision',
         'Property owners and managers can propose a residential, office, industrial or public site for vending machine placement review by Vendvision.',
         intro('For property owners and managers', 'Host a vending machine at your property',
               'Show us where residents, staff or visitors stop for refreshments. We’ll review the spot for vending placement.',
               button('Propose my site', '#site-submission'), image='site-survey.webp') +
         enquiry('site-submission', 'Propose your site', 'An estimate is fine. If you have a photo of the proposed spot, you can attach it in your email app.', 'location',
                 field('Property name') + field('Town and postcode') +
                 field('Property type', options=('Residential / condominium', 'Office', 'Factory / warehouse', 'Retail', 'Education', 'Healthcare', 'Sports / leisure', 'Other')) +
                 field('Your role or management company') + field('Contact number', 'tel', True) +
                 field('Estimated daily users or footfall', optional=True) +
                 field('Proposed spot, opening hours and power access', 'textarea', True)) +
         section('How we review your site', steps([
             ('Understand demand', 'We look at who uses the property, when it gets busy and where people already buy refreshments.'),
             ('Check the proposed spot', 'If the site looks suitable, we can review photos or arrange a visit to check space, power and access for refilling.'),
             ('Discuss placement terms', 'Before installation, both parties agree on the machine, servicing responsibilities and commercial terms.'),
         ])) +
         section('Planning a staff pantry?', link('Explore corporate pantry options', '/locations/#pantry')),
         service='Vending machine site placement enquiries')

    page('/locations/', 'Vending Locations & Corporate Pantry Klang Valley | Vendvision',
         'Submit a property for smart vending or request a corporate pantry proposal in the Klang Valley, including stocking, servicing and payment options.',
         intro('For property managers & employers', 'Vending locations and corporate pantry',
               'Request a vending setup for your property or a staffed-office pantry proposal for your team. ' + DATA['coverage']['locations'],
               button('Propose a site', '/propose-a-site/') + ' ' + button('Request a pantry proposal', '#pantry', True), image='office-pantry.webp') +
         section('What makes a site suitable?', '<p>We review regular footfall or headcount, opening hours, available space and power, signal or network access, delivery access and site permissions. The proposal identifies who stocks, cleans and services the machine and how access is arranged.</p>') +
         section('Pantry options for employers', '<p>A staff-paid setup lets employees pay at the machine. An employer-subsidised setup can support an agreed allowance or selected items, subject to payment and operating arrangements. Share expected users, shifts, the product mix and subsidy or budget preferences.</p>', 'tint') +
         section('Site and pantry planning guides', insight_links(['vending-machine-site-readiness-checklist',
                 'office-pantry-vending-malaysia'])) +
         section('Have a property in mind?', button('Propose a site', '/propose-a-site/'), anchor='site-submission') +
         enquiry('pantry', 'Request a pantry proposal', 'Tell us your office location, headcount and preferred payment arrangement.', 'pantry',
                 field('Company and postcode') + field('Headcount and working hours') +
                 field('Payment preference', options=('Staff-paid', 'Employer-subsidised', 'Discuss both')) + field('Product or budget preferences', 'textarea', True)),
         service='Vending site and corporate pantry proposals')

    page('/vendbi/', 'VendBI Vending Management Software | Vendvision',
         'Learn how VendBI helps vending operators monitor sales, stock and machine status. Explore the VendBI website for product details.',
         intro('Vending management software', 'Manage your machines with VendBI',
               'See sales, stock and machine status across your connected fleet.',
               button('Visit VendBI', 'https://www.vendbi.com/'), image='fleet-review.webp') +
         section('Tools for daily operations', cards([
             ('Sales and stock', 'View transactions and inventory to plan replenishment.', ''),
             ('Multiple locations', 'Review machine activity across your fleet from a single dashboard.', ''),
             ('Machine status', 'Review equipment status and available alerts for supported machines.', '')
         ])))

    page('/about.html', 'About Vendvision Resources Sdn Bhd | Malaysia',
         'Meet Vendvision Resources Sdn Bhd, a Malaysian smart vending and retail media company led by founder and managing director Melvin Chan.',
         intro('About Vendvision', 'Smart vending and retail media in Malaysia',
               'Vendvision Resources Sdn Bhd (1272299-T) supplies vending machines and supports operators. The Vendvision Brand Network connects brands and agencies with vending operators and participating locations.', image='founder.jpg') +
         section('The people behind Vendvision', '''<div class="about-grid">
          <figure><img src="/assets/extracted-p2-0.jpeg" width="380" height="490" loading="lazy" alt="The Vendvision team"><figcaption>The Vendvision team</figcaption></figure>
          <figure><img src="/assets/founder.jpg" width="724" height="1086" loading="lazy" alt="Melvin Chan, founder and managing director of Vendvision"><figcaption>Melvin Chan · Founder &amp; Managing Director</figcaption></figure>
          <div><h3>Our mission</h3><p>We build smarter unattended retail solutions for entrepreneurs, brands and the people who use them.</p><p>Our values are gratitude, family, humility, excellence and love.</p>''' +
                 button('Contact Vendvision', '/contact.html') + '</div></div>'))

    page('/contact.html', 'Contact Vendvision | Sales & Enquiries Malaysia',
         'Contact Vendvision Resources Sdn Bhd for vending machine quotes, campaign planning, operator partnerships, locations and aftersales support.',
         intro('Contact Vendvision', 'Talk to our team',
               f'{DATA["company"]} ({DATA["registration"]}). Message us on WhatsApp or send us an email.',
               button('WhatsApp ' + DATA['phone_display'], WA) + ' ' + button(DATA['email'], EMAIL, True), image='extracted-p2-0.jpeg') +
         section('Tell us what you need', cards([
             ('Brand campaigns', 'Share your target audience, areas and campaign dates.', link('Request a campaign plan', ADS + '#campaign-plan')),
             ('Machine buyers', 'Share your preferred model and location status.', link('Request a quote', MACHINES + '#machine-quote')),
             ('Operators', 'Share your fleet size and screen capability.', link('Check eligibility', '/operators/#operator-form')),
             ('Property owners and managers', 'Share a property for vending placement review.', link('Propose a site', '/propose-a-site/')),
             ('Employers', 'Tell us about your team and preferred payment arrangement.', link('Request a pantry proposal', '/locations/#pantry')),
             ('Aftersales', 'Share your model, postcode and support question. The WhatsApp number accepts messages only.', link('Message support on WhatsApp', WA))
         ])))

    categories = {}
    for article in ARTICLES:
        categories.setdefault(article['category'], []).append(article)
    category_sections = ''.join(
        section(escape(category), '<div class="cards">' + ''.join(
            f'<article class="card">{photo(a["image"])}<h3>{link(escape(a["title"]), insight_url(a["slug"]))}</h3>'
            f'<p>{escape(a["excerpt"])}</p></article>' for a in group
        ) + '</div>', 'tint' if index % 2 else '')
        for index, (category, group) in enumerate(categories.items())
    )
    page('/blog.html', 'Vending Insights & Practical Guides | Vendvision',
         'Explore ten actionable guides for Malaysian vending machine buyers, operators, advertisers, property managers and employers.',
         intro('Insights', 'Vending guides and checklists',
               'Practical checklists for buying, operating and advertising on vending machines.', image='pack-fit.webp') +
         category_sections)

    for article in ARTICLES:
        slug = article['slug']
        related = [item['slug'] for item in categories[article['category']] if item['slug'] != slug][:2]
        published = article['created_at']
        updated = article.get('updated_at')
        dates = f'Published <time datetime="{published}">{published}</time>'
        if updated:
            dates += f' · Updated <time datetime="{updated}">{updated}</time>'
        checklist = ''.join(f'<li>{escape(item)}</li>' for item in article['checklist'])
        reference = article.get('source')
        source = f'<p>{link(escape(reference["label"]), escape(reference["url"]))}</p>' if reference else ''
        action = article['action']
        body = f'''<section class="section"><div class="wrap prose">
          <p class="article-meta">Vendvision · {dates}</p>
          <p>{escape(article["opening"])}</p>
          <div class="insight-checklist"><h2>{escape(article["checklist_title"])}</h2>
          <ol>{checklist}</ol></div>
          <p>{escape(article["close"])}</p>{source}
          {button(action["label"], action["url"])}
          <div class="insight-related"><h2>Related guides</h2>{insight_links(related)}
          {link('All insights', '/blog.html')}</div></div></section>'''
        page(insight_url(slug), article['title'] + ' | Vendvision Insights', article['excerpt'],
             intro(escape(article['category']), escape(article['title']), escape(article['excerpt']), image=article['image']) +
             body, article=article)

    page('/404.html', 'Page not found | Vendvision', 'Find vending machines, brand campaigns and Vendvision contacts.',
         intro('404', 'Page not found', 'Return to the homepage to explore Vendvision’s services.', button('Back to homepage', '/'), image='v22-lobby-560.webp'), index=False)


NAV = [
    ('Brands & Agencies', ADS), ('Vending Machines', MACHINES), ('Operators', '/operators/'),
    ('Propose a Site', '/propose-a-site/'), ('Corporate Pantry', '/locations/#pantry'), ('VendBI', '/vendbi/')
]
EXTRAS = [('About', '/about.html'), ('Insights', '/blog.html'), ('Contact', '/contact.html')]
ORG = {
    '@type': 'Organization', '@id': ORIGIN + '/#organization', 'name': DATA['company'],
    'url': ORIGIN + '/', 'email': DATA['email'], 'logo': ORIGIN + '/assets/brand-horizontal.png',
    'identifier': DATA['registration']
}


def brand(stacked=False):
    image = 'brand-stacked.png' if stacked else 'brand-horizontal.png'
    width, height = (377, 392) if stacked else (1342, 347)
    return f'<a href="/" class="brand" aria-label="Vendvision home"><img src="/assets/{image}" alt="" width="{width}" height="{height}"></a>' 


def nav_links(items, current):
    return ''.join(
        f'<a href="{href}"{" aria-current=page" if current == href else ""}>{escape(label)}</a>'
        for label, href in items
    )


def render(path, record, mode):
    title, desc, body, service, article, index = record
    canonical = ORIGIN + path
    robots = 'index, follow' if mode == 'production' and index else 'noindex, nofollow'
    schema = [ORG]
    if service:
        schema.append({'@type': 'Service', 'name': service, 'description': desc, 'url': canonical,
                       'provider': {'@id': ORG['@id']}, 'areaServed': 'Malaysia' if path == MACHINES else 'Klang Valley, Malaysia'})
    if article:
        schema.append({'@type': 'Article', 'headline': article['title'], 'description': desc,
                       'datePublished': article['created_at'][:10], 'mainEntityOfPage': canonical,
                       'author': {'@id': ORG['@id']}, 'publisher': {'@id': ORG['@id']}})
        if article.get('updated_at'):
            schema[-1]['dateModified'] = article['updated_at']
    schema_json = json.dumps({'@context': 'https://schema.org', '@graph': schema}, ensure_ascii=False).replace('<', '\\u003c')
    analytics_id = DATA['production_ga4'] if mode == 'production' and index else ''
    delivery_path = DATA.get('production_delivery_path') if mode == 'production' else None
    if delivery_path and not re.fullmatch(r'/api/[a-z0-9/-]+', delivery_path):
        raise ValueError('Use a relative /api/ path for the production delivery service.')
    current = path if not article else '/blog.html'
    return f'''<!doctype html>
<html lang="en-MY"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title><meta name="description" content="{escape(desc)}">
<meta name="robots" content="{robots}"><link rel="canonical" href="{escape(canonical)}">
<meta name="theme-color" content="#fff9fc"><meta name="vendvision-ga4" content="{analytics_id}">
<meta name="vendvision-delivery" content="{escape(delivery_path or "")}">
<meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(desc)}">
<meta property="og:url" content="{escape(canonical)}">
<link rel="icon" href="/assets/icon.png" type="image/png">
<link rel="preload" href="/assets/bricolage-grotesque.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<script type="application/ld+json">{schema_json}</script><script src="/assets/site.js" defer></script></head>
<body data-view="{'guide' if article else path.strip('/').replace('.html', '') or 'home'}"><a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="wrap header-row">{brand()}
<nav class="desktop-nav" aria-label="Main navigation">{nav_links(NAV, current)}</nav>
<details class="mobile-nav"><summary>Menu</summary>
<nav aria-label="Mobile navigation">{nav_links(NAV + EXTRAS, current)}</nav></details>
</div></header>
<main id="main" tabindex="-1">{body}</main>
<footer><div class="wrap footer-grid">
<div>{brand(stacked=True)}<p>{DATA['company']}<br>{DATA['registration']}</p></div>
<nav aria-label="Explore Vendvision">{nav_links(NAV, current)}</nav>
<nav aria-label="Company">{nav_links(EXTRAS, current)}</nav>
<div><p><strong>Talk to Vendvision</strong></p><a href="{EMAIL}">{DATA['email']}</a><br>
<a href="{WA}">{DATA['phone_display']} · WhatsApp only</a></div>
</div></footer></body></html>'''


LEGACY_ARTICLES = {a['slug']: insight_url(a['slug']) for a in ARTICLES if a.get('legacy')}
REDIRECTS = {'/index.html': '/'}
GONE = {'/contact/submit', '/api/posts', *('/api/posts/' + slug for slug in LEGACY_ARTICLES)}


def route(path, query):
    if path in REDIRECTS:
        return 301, REDIRECTS[path]
    if path == '/blog-post.html':
        slugs = parse_qs(query).get('slug', [])
        if len(slugs) == 1 and slugs[0] in LEGACY_ARTICLES:
            return 301, LEGACY_ARTICLES[slugs[0]]
        return 404, None
    if path in GONE:
        return 410, None
    if path + '/' in PAGES:
        return 301, path + '/'
    if path.endswith('/index.html') and path[:-10] in PAGES:
        return 301, path[:-10]
    return None, None


def build(mode, target):
    target.mkdir(parents=True, exist_ok=True)
    if target in (ROOT, ROOT / 'assets', ROOT / 'content') or any(target.iterdir()):
        raise SystemExit('Choose an empty build directory.')
    shutil.copytree(ROOT / 'assets', target / 'assets')
    for path, record in PAGES.items():
        output = target / (path.lstrip('/') + ('index.html' if path.endswith('/') else ''))
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render(path, record, mode), encoding='utf-8')
    if mode == 'preview':
        robots = 'User-agent: *\nDisallow: /\n'
    else:
        robots = '\n'.join(f'User-agent: {bot}\nAllow: /\n' for bot in ('Googlebot', 'Bingbot', 'OAI-SearchBot', '*'))
        robots += f'\nSitemap: {ORIGIN}/sitemap.xml\n'
        urls = ''.join(f'<url><loc>{xml_escape(ORIGIN + p)}</loc></url>\n' for p, record in PAGES.items() if record[-1])
        (target / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n')
    (target / 'robots.txt').write_text(robots)


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('X-Robots-Tag', 'noindex, nofollow')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        request = urlsplit(self.path)
        status, destination = route(request.path, request.query)
        if destination:
            self.send_response(status)
            self.send_header('Location', destination)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        if status or (request.path not in PAGES and request.path != '/robots.txt' and
                      not re.fullmatch(r'/assets/[\w.-]+', request.path)):
            return self.error_page(status or 404)
        if request.path == '/404.html' or (request.path.startswith('/assets/') and
                                           not Path(self.translate_path(self.path)).is_file()):
            return self.error_page(404)
        return super().send_head()

    def do_POST(self):
        status, _ = route(urlsplit(self.path).path, '')
        with self.error_page(status if status == 410 else 405) as content:
            shutil.copyfileobj(content, self.wfile)

    def error_page(self, status):
        content = Path(self.directory, '404.html').open('rb')
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(Path(content.name).stat().st_size))
        self.end_headers()
        return content


def main():
    import tempfile

    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    preview = commands.add_parser('preview')
    preview.add_argument('--port', type=int, default=8765)
    preview.add_argument('--bind', default='127.0.0.1')
    generate = commands.add_parser('build')
    generate.add_argument('--mode', choices=('preview', 'production'), required=True)
    generate.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    make_pages()
    if args.command == 'build':
        build(args.mode, args.output.resolve())
    else:
        with tempfile.TemporaryDirectory(prefix='vendvision-preview-') as directory:
            build('preview', Path(directory))
            handler = partial(PreviewHandler, directory=directory)
            with ThreadingHTTPServer((args.bind, args.port), handler) as server:
                print(f'Preview at http://{args.bind}:{args.port}/', flush=True)
                try:
                    server.serve_forever()
                except KeyboardInterrupt:
                    pass


if __name__ == '__main__':
    main()

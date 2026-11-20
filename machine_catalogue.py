"""Render the machine directory from the reviewed supplier catalogue snapshot."""
import json
import re
from html import escape
from pathlib import Path
from urllib.parse import urlencode

BASE = '/machines/'
GROUPS = ['AI smart coolers', 'Snacks & drinks', 'Fresh & healthy food', 'Blind boxes & collectibles',
          'Sports vending', 'Frozen food', 'Coffee & beverages', 'Micro markets', 'Books',
          'Age verification', 'Hot meals', 'Vending lockers', 'Protective equipment', 'Pharmacy',
          'Specialist & custom machines', 'Regional clearance']
SOURCE_GROUPS = ['AI Vending Machine', 'Snack & Drink Vending Machine', 'Healthy Food Vending Machine',
                 'Blind Box Vending Machine', 'Sports Vending Machines', 'Frozen Food Vending Machine',
                 'Coffee Vending Machine', 'Micro Market Vending Machines', 'Book Vending Machine',
                 'Age Verification Vending Machine', 'Hot Food Vending Machine', 'Vending Locker',
                 'PPE Vending Machine', 'Pharmacy Vending Machine', 'OEM / ODM Vending Machine',
                 'Clearance Sale（Only sold in the Asia region）']


def category_path(name):
    return BASE + re.sub('[^a-z0-9]+', '-', name.lower()).strip('-') + '/'


def product_path(p):
    return BASE + 'model-' + p['id'] + '/'


FINISHES = json.loads(Path(__file__).with_name('catalogue').joinpath('finishes.json').read_text())


def photo(p):
    asset = '/assets/' + p['image']
    alt = escape(p['name'])
    regions = FINISHES.get(p['id'])
    if not regions:
        return f'<img src="{asset}" loading="lazy" decoding="async" alt="{alt}">'
    # Restrict the colour treatment to marked cabinet panels, preserving the stock photo.
    key = 'finish-' + p['id']
    rectangles = ''.join(f'<rect x="{x}" y="{y}" width="{right-x}" height="{bottom-y}"/>'
                         for x,y,right,bottom in regions)
    return f'''<svg class="finish-photo" role="img" aria-label="{alt}" viewBox="0 0 150 150">
    <defs><clipPath id="{key}-panels">{rectangles}</clipPath>
    <filter id="{key}" color-interpolation-filters="sRGB">
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -10 10 0 0 -.45" result="greenOverRed"/>
    <feColorMatrix in="SourceGraphic" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 10 -10 0 -.45" result="greenOverBlue"/>
    <feComposite in="greenOverBlue" in2="greenOverRed" operator="in" result="mask"/>
    <feColorMatrix in="SourceGraphic" values="0 .82 0 0 .09  .28 0 0 0 0  0 .48 0 0 .06  0 0 0 1 0"/>
    <feComposite in2="mask" operator="in"/></filter></defs>
    <image href="{asset}" width="150" height="150"/>
    <image href="{asset}" width="150" height="150" clip-path="url(#{key}-panels)" filter="url(#{key})"/>
    </svg>'''




def tile(p, label, path, detail):
    return (f'<a class="catalog-tile" href="{path}"><span class="catalog-photo">{photo(p)}</span>'
            f'<span class="catalog-tile-text"><strong>{escape(label)}</strong>'
            f'<small>{escape(detail)} <span aria-hidden="true">→</span></small></span></a>')


def grid(tiles):
    return '<div class="catalog-grid">' + ''.join(tiles) + '</div>'


def catalogue_brand():
    return '<div class="catalog-brand"><img src="/assets/vendvision-official-horizontal.svg" alt="Vendvision" loading="eager"></div>'


def crumb(path, label):
    return f'<a class="catalog-back" href="{path}">← {escape(label)}</a>'


def make_catalogue(page):
    products = json.loads(Path(__file__).with_name('catalogue').joinpath('products.json').read_text())
    categories = dict(zip(SOURCE_GROUPS, GROUPS))
    directory = []
    for group, label in categories.items():
        subset = [p for p in products if group in p['categories']]
        path = category_path(label)
        directory.append(tile(subset[0], label, path, f'{len(subset)} listings'))
        heading = crumb(BASE, 'All categories') + f'<h1>{escape(label)}</h1>'
        tiles = [tile(p, p['name'], product_path(p), 'View machine') for p in subset]
        page(path, label + ' | Vendvision Machine Catalogue', 'Browse machines and request a model-specific quotation.',
             f'<section class="wrap catalog-section">' + catalogue_brand() + heading + grid(tiles) + '</section>')
    page(BASE, 'Vending Machine Catalogue Malaysia | Vendvision',
         'Explore vending machines by application, check technical specifications and enquire about pricing.',
         '<section class="wrap catalog-section">' + catalogue_brand() + crumb('/services.html', 'Vending machines') +
         '<h1>Machine catalogue</h1><p class="lead">Choose what you want to vend. Explore the machines and request pricing for your site.</p>' +
         grid(directory) + '</section>')
    for p in products:
        name = p['name']
        label = categories[p['categories'][0]]
        query = urlencode({'subject': 'Machine pricing enquiry — ' + name + ' (#' + p['id'] + ')',
                           'body': 'Hello Vendvision,\n\nPlease quote for ' + name + '.\n\nLocation or postcode: \nProducts to vend: \nQuantity: \n'})
        action = f'<a class="button" href="mailto:hello@vendvision.co?{escape(query)}">Enquire about pricing ↗</a>'
        rows = ''.join(f'<tr><th scope="row">{escape(k)}</th><td>{escape(v)}</td></tr>' for k,v in p['specs'])
        specs = ('<table class="catalog-spec"><caption>Technical specifications</caption><tbody>' + rows + '</tbody></table>'
                 if rows else '<p>Contact us for the technical sheet and configuration options for this machine.</p>')
        notes = ('<p>Regional clearance listing. Ask about current condition, availability and delivery to your site.</p>'
                 if SOURCE_GROUPS[-1] in p['categories'] else '')
        if p.get('condition'):
            notes += '<p>Equipment condition: previously used.</p>'
        if p['id'] == '752':
            specs = '<p>Enquire for the matching technical sheet. The available sheet identifies a different model.</p>'
        body = ('<section class="wrap catalog-section">' + crumb(category_path(label), label) +
                catalogue_brand() + '<div class="catalog-model"><figure class="catalog-photo">' + photo(p) +
                '</figure><div><h1>' + escape(name) + '</h1>' + notes + action + specs + '</div></div></section>')
        page(product_path(p), name + ' | Vendvision', 'Machine specifications and pricing enquiries for ' + name + '.', body)

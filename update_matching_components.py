#!/usr/bin/env python3
"""
Script to update all matching engine components to use dynamic weights
"""

import os
import re

# Define the components and their default weights
COMPONENTS = {
    'naics-alignment': ('naics_alignment', 0.15),
    'past-performance': ('past_performance', 0.20),
    'certification-bonus': ('certification_bonus', 0.10),
    'geographic-match': ('geographic_match', 0.05),
    'capacity-fit': ('capacity_fit', 0.05),
    'recency-factor': ('recency_factor', 0.05)
}

BASE_PATH = '/Users/terrance/Projects/govbiz-ai/infrastructure/lambda/matching-engine'

def update_component_file(component_dir, config_name, default_weight):
    """Update a single component file"""
    handler_path = os.path.join(BASE_PATH, component_dir, 'handler.py')

    if not os.path.exists(handler_path):
        print(f"Handler not found: {handler_path}")
        return

    print(f"Updating {component_dir}...")

    # Read the file
    with open(handler_path, 'r') as f:
        content = f.read()

    # Add imports after the existing imports
    import_insertion = """
# Add the config management directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'config-management'))

try:
    from config_client import ConfigurationClient
except ImportError:
    # Fallback if config client is not available
    logger = logging.getLogger()
    logger.warning("Configuration client not available, using default weights")
    ConfigurationClient = None"""

    # Add sys import if not present
    if 'import sys' not in content:
        content = content.replace('import os', 'import os\nimport sys')

    # Find where to insert the config client import
    if 'from config_client import ConfigurationClient' not in content:
        # Find the end of imports section
        import_pattern = r'(from concurrent\.futures import.*?\n)'
        if re.search(import_pattern, content):
            content = re.sub(import_pattern, r'\1' + import_insertion, content)
        else:
            # Fallback - insert after logging import
            content = re.sub(r'(import logging\n)', r'\1' + import_insertion, content)

    # Update the lambda_handler to use dynamic weights
    old_handler_pattern = rf"""        # Return successful response
        return \{{
            'statusCode': 200,
            'body': json\.dumps\(\{{
                '[\w_]+': [\w_]+,
                'component': '{config_name}',
                'weight': {default_weight},
                'timestamp': int\(time\.time\(\)\)
            \}}\)
        \}}"""

    new_handler = f"""        # Extract tenant_id from company profile for configuration
        tenant_id = company_profile.get('tenant_id')

        # Get dynamic weight from configuration
        if ConfigurationClient:
            try:
                config_client = ConfigurationClient()
                weight = config_client.get_weight_for_component('{config_name}', tenant_id)
            except Exception as e:
                logger.warning(f"Failed to get dynamic weight, using default: {{str(e)}}")
                weight = {default_weight}
        else:
            weight = {default_weight}

        # Return successful response
        return {{
            'statusCode': 200,
            'body': json.dumps({{
                result_key: result_value,
                'component': '{config_name}',
                'weight': weight,
                'timestamp': int(time.time())
            }})
        }}"""

    # Find the specific weight pattern and replace it
    weight_pattern = rf"'weight': {default_weight},"
    if weight_pattern in content:
        # Extract the variable names from the return statement
        return_pattern = r"'body': json\.dumps\(\{\s*'([^']+)':\s*([^,\s]+),"
        match = re.search(return_pattern, content)
        if match:
            result_key_name = match.group(1)
            result_var_name = match.group(2)

            # Replace the entire lambda handler section
            handler_pattern = rf"""        {re.escape(result_var_name)} = .*?\n\n        # Return successful response
        return \{{
            'statusCode': 200,
            'body': json\.dumps\(\{{
                '{re.escape(result_key_name)}': {re.escape(result_var_name)},
                'component': '{re.escape(config_name)}',
                'weight': {default_weight},
                'timestamp': int\(time\.time\(\)\)
            \}}\)
        \}}"""

            new_replacement = f"""        {result_var_name} = """ + """${calculation_placeholder}

        # Extract tenant_id from company profile for configuration
        tenant_id = company_profile.get('tenant_id')

        # Get dynamic weight from configuration
        if ConfigurationClient:
            try:
                config_client = ConfigurationClient()
                weight = config_client.get_weight_for_component('""" + f"{config_name}" + """', tenant_id)
            except Exception as e:
                logger.warning(f"Failed to get dynamic weight, using default: {str(e)}")
                weight = """ + f"{default_weight}" + """
        else:
            weight = """ + f"{default_weight}" + """

        # Return successful response
        return {
            'statusCode': 200,
            'body': json.dumps({
                '""" + f"{result_key_name}" + f"""': {result_var_name},
                'component': '{config_name}',
                'weight': weight,
                'timestamp': int(time.time())
            }})
        }}"""

            # Extract the calculation part before "Return successful response"
            calc_pattern = rf"""        {re.escape(result_var_name)} = ([^#]*?)        # Return successful response"""
            calc_match = re.search(calc_pattern, content, re.DOTALL)
            if calc_match:
                calculation_part = calc_match.group(1).strip()
                final_replacement = new_replacement.replace("${calculation_placeholder}", calculation_part)

                # Replace the whole section
                content = re.sub(handler_pattern, final_replacement, content, flags=re.DOTALL)
            else:
                # Simpler approach - just replace the weight line
                content = content.replace(
                    f"'weight': {default_weight},",
                    "'weight': weight,"
                )
                # Add the tenant_id and weight logic before the return statement
                insert_before_return = f"""
        # Extract tenant_id from company profile for configuration
        tenant_id = company_profile.get('tenant_id')

        # Get dynamic weight from configuration
        if ConfigurationClient:
            try:
                config_client = ConfigurationClient()
                weight = config_client.get_weight_for_component('{config_name}', tenant_id)
            except Exception as e:
                logger.warning(f"Failed to get dynamic weight, using default: {{str(e)}}")
                weight = {default_weight}
        else:
            weight = {default_weight}

        """
                content = content.replace(
                    "        # Return successful response",
                    insert_before_return + "        # Return successful response"
                )

    # Write the updated file
    with open(handler_path, 'w') as f:
        f.write(content)

    print(f"Updated {component_dir} successfully")

def main():
    """Update all matching components"""
    for component_dir, (config_name, default_weight) in COMPONENTS.items():
        update_component_file(component_dir, config_name, default_weight)

    print("All components updated!")

if __name__ == "__main__":
    main()